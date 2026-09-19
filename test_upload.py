import urllib.request
import json
import urllib.error

url = 'http://127.0.0.1:8000/api/services/upload'
data = json.dumps({"services":[]}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code}")
except urllib.error.URLError as e:
    print(f"URLError: {e.reason}")
