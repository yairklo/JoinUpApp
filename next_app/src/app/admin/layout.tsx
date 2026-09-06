"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { useIsAdmin } from "@/hooks/useIsAdmin";

import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const ADMIN_TABS = [
  { href: "/admin/fields", label: "ניהול מגרשים" },
  { href: "/admin/moderation", label: "הודעות שסומנו" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useIsAdmin();
  const pathname = usePathname();

  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      {status === "loading" && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      )}

      {status === "signed-out" && (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography gutterBottom>עליך להתחבר כדי לגשת לאזור הניהול.</Typography>
            <SignInButton mode="modal">
              <Button variant="contained">התחברות</Button>
            </SignInButton>
          </CardContent>
        </Card>
      )}

      {status === "denied" && (
        <Alert severity="warning">אין הרשאת מפעיל. פנו למי שמגדיר ADMIN_USER_IDS או Clerk metadata.</Alert>
      )}

      {status === "allowed" && (
        <>
          <Tabs
            value={ADMIN_TABS.some((tab) => tab.href === pathname) ? pathname : false}
            sx={{ mb: 3 }}
          >
            {ADMIN_TABS.map((tab) => (
              <Tab key={tab.href} value={tab.href} label={tab.label} component={Link} href={tab.href} />
            ))}
          </Tabs>
          {children}
        </>
      )}
    </Container>
  );
}
