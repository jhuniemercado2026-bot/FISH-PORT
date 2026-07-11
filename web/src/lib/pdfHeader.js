let headerPngPromise = null;

export const getHeaderPngBytes = () => {
  if (headerPngPromise) {
    return headerPngPromise;
  }

  headerPngPromise = (async () => {
    try {
      const response = await fetch("/images/header.png");
      if (!response.ok) {
        return null;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  })();

  return headerPngPromise;
};
