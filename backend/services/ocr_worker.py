import sys
import os
import json

# Setup env vars to disable checks and logging outputs
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["GLOG_minloglevel"] = "3"
os.environ["PPOCR_LOG_LEVEL"] = "ERROR"
os.environ["TQDM_DISABLE"] = "True"

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    try:
        from paddleocr import PaddleOCR
        ocr_client = PaddleOCR(use_angle_cls=True, lang="en")
        result = ocr_client.ocr(image_path)
        
        if not result:
            print(json.dumps({"text": ""}))
            return
            
        lines = []
        if isinstance(result[0], dict):
            for res_dict in result:
                if "rec_texts" in res_dict:
                    for text_str in res_dict["rec_texts"]:
                        if text_str:
                            lines.append(text_str.strip())
        else:
            for line in result[0] if isinstance(result[0], list) else result:
                if line and len(line) > 1 and line[1]:
                    text_str = line[1][0]
                    if text_str:
                        lines.append(text_str.strip())
                        
        print(json.dumps({"text": "\n".join(lines)}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
