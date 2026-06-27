import time
import pytest
import json
from datetime import datetime, timezone, timedelta, date
import unittest.mock as mock
from fastapi.testclient import TestClient

# Mock environment setup
VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db?sslmode=require",
    "UPSTASH_REDIS_REST_URL": "https://dev-recall-redis.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "dev_upstash_redis_token",
    "FERNET_KEY": "yF4P-W965hF17Bq_Q7g_oG5l8S631P9_9z-d8v7d8sA=",
    "JWT_SECRET": "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    "WEBSITE_URL": "http://localhost:5173",
    "ENV": "test",
}

@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    for k, v in VALID_ENV.items():
        monkeypatch.setenv(k, v)

from backend.main import app

class StatsTestDbState:
    def __init__(self):
        self.processed = set()
        self.users = {"12345": 1}
        self.streak_counts = {1: 5}
        self.quizzes = [
            {
                "id": 101,
                "user_id": 1,
                "question": "Q1",
                "options": json.dumps(["A", "B", "C", "D"]),
                "correct_index": 1,
                "explanation": "Exp1",
                "ease_factor": 2.6,
                "interval_days": 8,  # Mastered (ef >= 2.5, int >= 7)
                "next_review": date.today()
            },
            {
                "id": 102,
                "user_id": 1,
                "question": "Q2",
                "options": json.dumps(["A", "B", "C", "D"]),
                "correct_index": 1,
                "explanation": "Exp2",
                "ease_factor": 2.0,
                "interval_days": 2,  # Not mastered
                "next_review": date.today()
            },
            {
                "id": 103,
                "user_id": 1,
                "question": "Q3",
                "options": json.dumps(["A", "B", "C", "D"]),
                "correct_index": 1,
                "explanation": "Exp3",
                "ease_factor": 2.5,
                "interval_days": 2,  # Not mastered (interval < 7)
                "next_review": date.today()
            },
            {
                "id": 104,
                "user_id": 1,
                "question": "Q4",
                "options": json.dumps(["A", "B", "C", "D"]),
                "correct_index": 1,
                "explanation": "Exp4",
                "ease_factor": 2.4,
                "interval_days": 10,  # Not mastered (ef < 2.5)
                "next_review": date.today() + timedelta(days=2)  # Not due today
            }
        ]
        self.answers = [
            # Two answers logged historically
            {"user_id": 1, "quiz_id": 101, "quality": 5, "answered_at": datetime.now() - timedelta(days=1)},
            {"user_id": 1, "quiz_id": 102, "quality": 4, "answered_at": datetime.now()}
        ]

class StatsMockCursor:
    def __init__(self, state):
        self.state = state
        self.rowcount = 0
        self._last_val = None
        self._rows = []
        self._row_idx = 0
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        query_upper = query.upper()
        self._rows = []
        self._row_idx = 0
        self._last_val = None
        
        if "INSERT INTO USERS" in query_upper:
            chat_id = params[0]
            if chat_id not in self.state.users:
                user_id = len(self.state.users) + 1
                self.state.users[chat_id] = user_id
            self._last_val = self.state.users[chat_id]
            
        elif "USERS" in query_upper:
            if params:
                param = params[0]
                if isinstance(param, str) and param in self.state.users:
                    self._last_val = self.state.users[param]
                    self._rows = [(self.state.users[param], param)]
                else:
                    self._last_val = int(param) if str(param).isdigit() else 1
                    self._rows = [(self._last_val, "12345")]
            else:
                self._last_val = 1
                self._rows = [(1, "12345")]
            
        elif "WITH STATS AS" in query_upper:
            u_id = params[0]
            user_quizzes = [q for q in self.state.quizzes if q["user_id"] == u_id]
            total = len(user_quizzes)
            due_today = sum(1 for q in user_quizzes if q["next_review"] <= date.today())
            answered_all_time = sum(1 for a in self.state.answers if a["user_id"] == u_id)
            
            avg_ef = sum(q["ease_factor"] for q in user_quizzes) / total if total > 0 else 0.0
            mastered = sum(1 for q in user_quizzes if q["ease_factor"] >= 2.5 and q["interval_days"] >= 7)
            
            # Generate dummy 7 days
            history = []
            for i in range(6, -1, -1):
                dt = date.today() - timedelta(days=i)
                history.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "day": dt.strftime("%a"),
                    "count": sum(1 for a in self.state.answers if a["user_id"] == u_id and a["answered_at"].date() == dt)
                })
            
            self._rows = [(
                total,
                due_today,
                answered_all_time,
                avg_ef,
                mastered,
                json.dumps(history)
            )]
            
        elif "SELECT ID, USER_ID, ITEM_ID, QUESTION, OPTIONS, CORRECT_INDEX" in query_upper:
            q_id = params[0]
            u_id = params[1]
            found = [q for q in self.state.quizzes if q["id"] == q_id and q["user_id"] == u_id]
            if found:
                quiz = found[0]
                self._rows = [(
                    quiz["id"],
                    quiz["user_id"],
                    1, # item_id
                    quiz["question"],
                    quiz["options"],
                    quiz["correct_index"],
                    quiz["explanation"],
                    quiz["ease_factor"],
                    quiz["interval_days"],
                    quiz["next_review"],
                    datetime.now()
                )]
                
        elif "UPDATE QUIZZES" in query_upper:
            ef, interval, next_rev, q_id, u_id = params
            for q in self.state.quizzes:
                if q["id"] == q_id and q["user_id"] == u_id:
                    q["ease_factor"] = ef
                    q["interval_days"] = interval
                    q["next_review"] = next_rev
            self.rowcount = 1
            
        elif "INSERT INTO QUIZ_ANSWERS" in query_upper:
            u_id, q_id, qual = params
            self.state.answers.append({
                "user_id": u_id,
                "quiz_id": q_id,
                "quality": qual,
                "answered_at": datetime.now()
            })
            self.rowcount = 1

    async def fetchone(self):
        if self._last_val is not None:
            val = (self._last_val, str(self._last_val))
            self._last_val = None
            return val
        if self._rows and self._row_idx < len(self._rows):
            val = self._rows[self._row_idx]
            self._row_idx += 1
            return val
        return None

class StatsMockConnection:
    def __init__(self, state):
        self.state = state
        self._cursor = StatsMockCursor(state)
        
    def cursor(self):
        return self._cursor
        
    async def commit(self):
        pass

@pytest.fixture()
def db_state():
    return StatsTestDbState()

@pytest.fixture(autouse=True)
def override_db(patch_env, db_state):
    from backend.db.connection import get_db
    
    async def _mock_get_db():
        yield StatsMockConnection(db_state)
        
    app.dependency_overrides[get_db] = _mock_get_db
    yield
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

def get_auth_token(user_id=1):
    from backend.middleware.twa_auth import generate_jwt
    from backend.config import settings
    payload = {
        "sub": str(user_id),
        "chat_id": "12345",
        "exp": int(time.time()) + 3600
    }
    return generate_jwt(payload, settings.JWT_SECRET)

def test_get_quiz_stats_schema_and_calculation(client, db_state):
    token = get_auth_token(user_id=1)
    # Fetch stats initially
    response = client.get("/api/quizzes/stats", cookies={"recall_session": token})
    assert response.status_code == 200
    data = response.json()
    
    assert data["total"] == 4
    assert data["due_today"] == 3
    assert data["answered_all_time"] == 2
    # avg_ease_factor = (2.6 + 2.0 + 2.5 + 2.4) / 4 = 2.375
    assert abs(data["avg_ease_factor"] - 2.375) < 0.0001
    assert data["mastered"] == 1  # Quiz 101 only
    assert data["mastered_definition"] == "ease_factor >= 2.5 AND interval_days >= 7"
    assert len(data["last_7_days"]) == 7

def test_quiz_answer_logging(client, db_state):
    token = get_auth_token(user_id=1)
    # Answer a quiz via API
    payload = {"quality": 5}
    response = client.post("/api/quizzes/101/answer", json=payload, cookies={"recall_session": token})
    assert response.status_code == 200
    
    # Assert answer is logged to DB
    assert len(db_state.answers) == 3
    assert db_state.answers[-1]["quiz_id"] == 101
    assert db_state.answers[-1]["quality"] == 5
    
    # Fetch stats and confirm counts went up
    response = client.get("/api/quizzes/stats", cookies={"recall_session": token})
    assert response.status_code == 200
    data = response.json()
    assert data["answered_all_time"] == 3
