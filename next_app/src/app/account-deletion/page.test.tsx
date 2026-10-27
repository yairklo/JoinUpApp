import { renderToStaticMarkup } from "react-dom/server";
import AccountDeletionPage from "./page";

const render = async (lang?: string) =>
    renderToStaticMarkup(await AccountDeletionPage({ searchParams: Promise.resolve(lang ? { lang } : {}) }));

describe("/account-deletion (public page)", () => {
    test("renders for a guest in Hebrew by default with key headings and the policy contact", async () => {
        const html = await render();
        expect(html).toContain('dir="rtl"');
        expect(html).toContain("מחיקת חשבון JoinUp");
        expect(html).toContain("איך מוחקים את החשבון");
        expect(html).toContain("מה נמחק");
        expect(html).toContain("מה נשמר");
        expect(html).toContain("joinupapp.support@gmail.com");
        expect(html).toContain('href="/legal/privacy"');
    });

    test("renders English LTR with ?lang=en", async () => {
        const html = await render("en");
        expect(html).toContain('dir="ltr"');
        expect(html).toContain("Delete your JoinUp account");
        expect(html).toContain("How to delete your account");
        expect(html).toContain("What is deleted");
        expect(html).toContain("What is kept");
        expect(html).toContain("Parents and guardians of minors");
    });
});
