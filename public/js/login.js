document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-login-form]");
  const errorEl = document.querySelector("[data-auth-error]");
  const nextUrl = new URLSearchParams(location.search).get("next") || "matches.html";

  if (WCAuth.getCurrentUser()) {
    location.href = nextUrl;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";
    const result = await WCAuth.login({
      email: form.elements.email.value,
      password: form.elements.password.value,
    });
    submitButton.disabled = false;
    submitButton.textContent = "Login";

    if (!result.success) {
      errorEl.textContent = result.error;
      return;
    }
    location.href = nextUrl;
  });
});
