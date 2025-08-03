export async function getCookies(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, resolve);
  });
}

export async function setCookie(details) {
  return new Promise((resolve) => {
    chrome.cookies.set(details, resolve);
  });
}

export async function deleteCookie(url, name) {
  return new Promise((resolve) => {
    chrome.cookies.remove({ url, name }, resolve);
  });
}

export async function deleteAllCookies(cookies) {
  for (const cookie of cookies) {
    const url =
      (cookie.secure ? "https://" : "http://") +
      cookie.domain.replace(/^\./, "") +
      cookie.path;
    await deleteCookie(url, cookie.name);
  }
}
