import subprocess

try:
    content = subprocess.check_output(["git", "show", "HEAD~1:index.html"], text=True)
    with open("index_old.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("Successfully restored main_old.py")
except Exception as e:
    print(f"Error: {e}")
