# API Examples

```bash
curl http://127.0.0.1:8000/api/dataset/summary
curl "http://127.0.0.1:8000/api/neurons/search?q=DNp01"
curl http://127.0.0.1:8000/api/neurons/10001
curl "http://127.0.0.1:8000/api/neurons/10001/incoming?page=1&page_size=25&sort=weight_desc"
curl "http://127.0.0.1:8000/api/neurons/10001/outgoing?page=1&page_size=25&search=DNp"
curl "http://127.0.0.1:8000/api/neurons/10001/neighborhood?direction=both&max_nodes=50"
curl "http://127.0.0.1:8000/api/neurons/10001/export?format=markdown"
curl "http://127.0.0.1:8000/api/neurons/10671/connections/outgoing/export?sort=weight_desc"
```

Connection CSV export returns all matching filtered rows for the requested direction. `max_nodes` is a hard upper bound for neighborhood graph responses.
