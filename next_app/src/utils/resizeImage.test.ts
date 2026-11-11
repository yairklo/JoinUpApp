import { jpegFileName, shouldUseResizedCopy, resizeImageFile } from "./resizeImage";

describe("jpegFileName", () => {
    test("swaps the extension for .jpg", () => {
        expect(jpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
        expect(jpegFileName("field.photo.png")).toBe("field.photo.jpg");
    });

    test("handles names without a usable base", () => {
        expect(jpegFileName("snapshot")).toBe("snapshot.jpg");
        expect(jpegFileName(".hidden")).toBe(".hidden.jpg");
        expect(jpegFileName("")).toBe("photo.jpg");
    });
});

describe("shouldUseResizedCopy", () => {
    test("a scaled-down copy always replaces the original", () => {
        expect(shouldUseResizedCopy({ resized: true, originalSize: 100, resultSize: 900 })).toBe(true);
    });

    test("a same-size re-encode is used only when it is smaller", () => {
        expect(shouldUseResizedCopy({ resized: false, originalSize: 1000, resultSize: 400 })).toBe(true);
        expect(shouldUseResizedCopy({ resized: false, originalSize: 400, resultSize: 1000 })).toBe(false);
        expect(shouldUseResizedCopy({ resized: false, originalSize: 400, resultSize: 400 })).toBe(false);
    });

    test("an empty result is never used", () => {
        expect(shouldUseResizedCopy({ resized: true, originalSize: 400, resultSize: 0 })).toBe(false);
    });
});

describe("resizeImageFile", () => {
    test("returns the original file when the image cannot be decoded", async () => {
        // The jest environment is node: there is no createImageBitmap, Image or canvas, which is
        // exactly the "decode failed" path. The upload must still go ahead with the original.
        const file = { name: "a.png", type: "image/png", size: 10, lastModified: 0 } as unknown as File;
        await expect(resizeImageFile(file)).resolves.toBe(file);
    });
});
