# Step 1: Login Form

The sign-in form will provide a field for the URL and a hidden
[CSRF token](https://laravel.com/docs/8.x/csrf). The CSRF token will be
hashed and verified using HMAC from WebCrypto, and will expire after 10
minutes. See [Sign & Verify JWT (HMAC SHA256) in Deno][sign-verify-deno].

[`docs/login-form/package.json`](https://macchiato.dev/code)

[`docs/login-form/login.html`](https://macchiato.dev/code)

[`docs/login-form/app.ts`](https://macchiato.dev/code)

In the above code, there is a general-purpose sign and verify function, as well
as a function for generating a CSRF token and a function for verifying it.

Run the example (set SECRET_KEY to a random string):

[`server`](https://macchiato.dev/server)

```bash
pnpm start
```

If you go to the web server, it will show a form, and you can enter anything into
the input and submit it (it isn't used yet) and submit it, and if it's been less
than ten minutes since you loaded the page, it should say "Ready to redirect".
