const MAX_IMAGE_SIZE = 1500000;

export async function compressImage(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(
      "Format non compatible. Utilise une image JPG, PNG ou WebP."
    );
  }

  if (file.size <= MAX_IMAGE_SIZE) {
    return file;
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Impossible de lire cette image."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Impossible de compresser cette image.");
    }

    let maxDimension = 2400;

    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(
        1,
        maxDimension / Math.max(image.width, image.height)
      );

      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.92, 0.85, 0.75, 0.65]) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", quality);
        });

        if (blob && blob.size <= MAX_IMAGE_SIZE) {
          return new File(
            [blob],
            file.name.replace(/\.[^.]+$/, "") + ".jpg",
            { type: "image/jpeg" }
          );
        }
      }

      maxDimension = Math.round(maxDimension * 0.75);
    }

    throw new Error(
      "Cette image est trop volumineuse. Essaie une image plus légère."
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
