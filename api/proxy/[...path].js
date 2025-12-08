export default async function handler(req, res) {
  const BACKEND = "http://api.3dchessbattle.com:3000"; // your Lightsail backend

  const target = BACKEND + req.url.replace(/^\/api\/proxy/, "");

  
  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Accept: "application/json",
      },
      body: ["POST", "PUT", "PATCH"].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}