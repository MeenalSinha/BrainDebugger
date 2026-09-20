# API Examples

```bash
curl http://127.0.0.1:8000/api/dataset/summary
curl "http://127.0.0.1:8000/api/neurons/search?q=DNp01"
curl http://127.0.0.1:8000/api/neurons/10001
curl "http://127.0.0.1:8000/api/neurons/10001/neighborhood?direction=both&max_nodes=50"
curl "http://127.0.0.1:8000/api/neurons/10001/export?format=markdown"
```
