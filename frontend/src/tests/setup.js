import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.open
window.open = vi.fn();

// Mock fetch globally
window.fetch = vi.fn();

// Mock alert
window.alert = vi.fn();
