/**
 * Utilitário de Compressão de Imagens Client-Side via HTML5 Canvas.
 * Converte imagens pesadas (PNG/JPG até 15MB) em WebP otimizado (<200KB) antes do upload no Supabase Storage.
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  outputType?: 'image/webp' | 'image/jpeg';
}

export async function compressImageBeforeUpload(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const { maxDimension = 1920, quality = 0.82, outputType = 'image/webp' } = options;

  // Se não for imagem ou for SVG/GIF, não altera o arquivo
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const img = document.createElement('img');
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Redimensionamento proporcional se exceder a dimensão máxima
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // Se a imagem comprimida for maior que o original, mantém o original
          if (blob.size >= file.size) {
            resolve(file);
            return;
          }

          const extension = outputType === 'image/webp' ? '.webp' : '.jpg';
          const newFileName = file.name.replace(/\.[^/.]+$/, '') + extension;

          const compressedFile = new File([blob], newFileName, {
            type: outputType,
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
