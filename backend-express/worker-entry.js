import express from 'express';
import { Request, Response } from 'express';

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json());

export default {
  async fetch(request, env, ctx) {
    return new Promise((resolve, reject) => {
      const url = new URL(request.url);
      const req = Object.assign(request, {
        method: request.method,
        url: url.pathname + url.search,
        headers: Object.fromEntries(request.headers),
        query: Object.fromEntries(url.searchParams),
        ip: request.headers.get('cf-connecting-ip') || 'unknown',
      });

      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader(name, value) {
          this.headers[name] = value;
          return this;
        },
        getHeader(name) {
          return this.headers[name];
        },
        removeHeader(name) {
          delete this.headers[name];
          return this;
        },
        send(body) {
          this.body = body;
          resolve(new Response(this.body, {
            status: this.statusCode,
            headers: this.headers,
          }));
          return this;
        },
        json(body) {
          this.setHeader('Content-Type', 'application/json');
          this.body = JSON.stringify(body);
          resolve(new Response(this.body, {
            status: this.statusCode,
            headers: this.headers,
          }));
          return this,
        },
        end(body) {
          if (body !== undefined) this.body = body;
          resolve(new Response(this.body, {
            status: this.statusCode,
            headers: this.headers,
          }));
          return this;
        },
      };

      app(req, res);
    });
  },
};

// Re-export the original app for local development
export { app };