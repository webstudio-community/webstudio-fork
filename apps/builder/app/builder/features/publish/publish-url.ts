const ensureProtocol = (domain: string, secure: boolean) => {
  try {
    return new URL(domain);
  } catch {
    const url = new URL(`//${domain}`, "https://default.invalid");
    url.protocol = secure ? "https:" : "http:";
    return url;
  }
};

export const getPublishUrl = ({
  domain,
  pathname,
  password,
  username,
  secure = true,
}: {
  domain: string;
  pathname: string;
  username?: string;
  password?: string;
  // Only the built-in domain can be plain http (local self-hosting without TLS).
  secure?: boolean;
}) => {
  const url = ensureProtocol(domain, secure);
  url.pathname = pathname || "/";

  if (username && password) {
    url.username = username;
    url.password = password;
  }

  return url;
};
