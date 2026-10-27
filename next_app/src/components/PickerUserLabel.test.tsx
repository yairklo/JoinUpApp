import { renderToStaticMarkup } from "react-dom/server";
import PickerUserLabel from "./PickerUserLabel";

describe("PickerUserLabel", () => {
    it("renders an img with the user's imageUrl", () => {
        const html = renderToStaticMarkup(<PickerUserLabel name="דנה לוי" imageUrl="https://example.com/dana.png" />);
        expect(html).toMatch(/<img[^>]+src="https:\/\/example\.com\/dana\.png"/);
        expect(html).toContain("דנה לוי");
    });
    it("falls back to initials without an imageUrl", () => {
        const html = renderToStaticMarkup(<PickerUserLabel name="דנה לוי" />);
        expect(html).not.toContain("<img");
    });
});
