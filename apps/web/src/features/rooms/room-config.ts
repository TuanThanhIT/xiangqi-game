function origin(value: string | undefined): string {
  if (!value) throw new Error("Thiếu cấu hình địa chỉ backend.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Địa chỉ backend không hợp lệ."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) throw new Error("Địa chỉ backend phải là HTTP origin.");
  return url.origin;
}
export const getBackendHttpOrigin = () => origin(process.env.BACKEND_HTTP_URL);
export const getBackendSocketOrigin = () => origin(process.env.NEXT_PUBLIC_BACKEND_SOCKET_URL);
