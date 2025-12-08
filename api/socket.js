import { createProxyServer } from "http-proxy";

const proxy = createProxyServer({
  target: "http://100.31.30.28:3000",
  ws: true,
  changeOrigin: true
});

export default function handler(req, res) {
  proxy.web(req, res, {}, (err) => {
    res.statusCode = 500;
    res.end("WebSocket proxy error");
  });
}

export const config = {
  api: { bodyParser: false }
};

export function websocket(req, socket, head) {
  proxy.ws(req, socket, head);
}