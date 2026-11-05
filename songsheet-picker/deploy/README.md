# Deploying the theme picker to the Abacus VM

Public URL: https://bible-explorer.abacusai.cloud/songsheet-picker/api/ (port 8098, 127.0.0.1 only).
Read `~/AGENTS.md` on the VM first. If SSH times out, the VM is asleep — wake it from the Abacus UI.

1. Copy code (no macOS `._*` files):
   `COPYFILE_DISABLE=1 tar czf - --exclude .venv --exclude tests --exclude .pytest_cache --exclude __pycache__ -C songsheet-picker . | ssh abacus 'mkdir -p ~/songsheet-picker && tar xzf - -C ~/songsheet-picker'`
2. `~/songsheet-picker/.env` (chmod 600, never committed): `PICKER_KEY=<same value as the worker secret>`
3. `sudo ln -sf /home/ubuntu/songsheet-picker/deploy/songsheet-picker.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now songsheet-picker`
4. Smoke: `curl -s 127.0.0.1:8098/api/health`
5. nginx: back up the bible-explorer vhost, add `deploy/nginx-location.conf`'s block, `sudo nginx -t && sudo systemctl reload nginx`.
6. Check `/`, `/explorer?versenumber=1`, `/adams-chart/mobile.html` still return 200.

Code updates: repeat step 1, then `sudo systemctl restart songsheet-picker`.
