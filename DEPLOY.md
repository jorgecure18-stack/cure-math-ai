# cure.math AI: deployment

The app is cloud-ready but is still local until it is connected to a hosting account.

## Render

1. Push this repository to a private or public Git provider.
2. Create a Web Service from the repository.
3. Render can use `render.yaml` automatically.
4. Set `ALLOWED_ORIGINS` to the public HTTPS origin.
5. Set `OLLAMA_MODEL` only when the hosting environment provides an Ollama-compatible model endpoint. Otherwise connect `/api/chat` to the chosen hosted model provider.

## Production notes

- Keep uploaded materials client-side by default; the current UI extracts text locally before sending only the selected context to the tutor.
- Add authentication, rate limiting, encrypted object storage, retention controls, and a real consent/privacy policy before public launch.
- Do not store API keys in the frontend.
