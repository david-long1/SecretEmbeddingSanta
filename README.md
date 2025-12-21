### Local embeddings server
We use a git repo we cloned the `qwen3-embeddings-mlx`. To start the server is simple:
```sh
cd qwen3-embeddings-mlx
uv venv # one time
source .venv/bin/activate
uv pip install -r requirements.txt # one time
uv run server.py
```
Then the server is up and running on localhost port 8000.
I tested generating an embedding:
```sh
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```
Output:
```
{"embedding":[0.031982421875,0.03662109375, ... ,0.02587890625,0.021728515625],"model":"mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ","dim":1024,"normalized":true,"processing_time_ms":57.959794998168945}
```