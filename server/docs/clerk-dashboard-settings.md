# Clerk dashboard settings (display profile lives in our DB)

Our DB (`User.name`, `User.imageUrl`, ...) is the source of truth for display profile data; Clerk
only manages login credentials. The web "manage account" modal hides Clerk's name/image/username
sections via CSS (`next_app/src/lib/clerkHe.ts`), but that is cosmetic and does not cover the
Clerk API or mobile SDK.

Recommended, in the Clerk dashboard (User & authentication → Attributes / Profile):

- Disable (or stop collecting) **first name / last name** if they are not required for sign-up.
- Disable **username** if unused.
- Disable **profile image** editing so `user.setProfileImage` can no longer be used by clients.

Apply to both dev and production instances.
