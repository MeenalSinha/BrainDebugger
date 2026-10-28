import subprocess
import sys
import time
import urllib.request

def wait_for_server(url="http://localhost:8000/health", timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False

def main():
    print("Starting uvicorn server on localhost:8000...")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.main:app", "--port", "8000"])
    try:
        if not wait_for_server():
            print("Server failed to start within timeout.")
            sys.exit(1)
        print("Server is up and healthy! Running e2e_verify.py...")
        ret = subprocess.call([sys.executable, "e2e_verify.py"])
        sys.exit(ret)
    finally:
        print("Terminating server...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

if __name__ == "__main__":
    main()

