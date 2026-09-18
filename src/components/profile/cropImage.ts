// Helper that takes a source image URL + a cropped-area pixel rect
// (from react-easy-crop) and produces a square PNG Blob of the
// requested output size. The shadcn <Avatar> already clips to a
// circle, so a square PNG is enough — we don't need to bake an alpha
// circle into the output.

export type Area = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function getCroppedBlob(
  imageSrc: string,
  area: Area,
  outputSize = 512,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Fill background so transparent source pixels render predictably.
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, outputSize, outputSize);

  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode image"));
      },
      "image/png",
      0.95,
    );
  });
}
