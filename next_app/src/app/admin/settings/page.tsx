"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminSettingsApi } from "@/services/api/adminSettings";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";

export default function AdminSettingsPage() {
  const { getToken } = useAuth();
  const [tournamentsPublic, setTournamentsPublic] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const s = await adminSettingsApi.get(token);
      setTournamentsPublic(s.tournamentsPublic === true);
    } catch {
      setError("טעינת ההגדרות נכשלה, נסה לרענן.");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (next: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const s = await adminSettingsApi.update({ tournamentsPublic: next }, token);
        setTournamentsPublic(s.tournamentsPublic === true);
      } catch {
        setError("שמירת ההגדרה נכשלה.");
      } finally {
        setSaving(false);
      }
    },
    [getToken],
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          הגדרות כלליות
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {tournamentsPublic === null && !error ? (
          <CircularProgress size={24} />
        ) : (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={tournamentsPublic === true}
                  disabled={saving || tournamentsPublic === null}
                  onChange={(e) => void toggle(e.target.checked)}
                />
              }
              label="טורנירים גלויים לכל השחקנים"
            />
            <Typography variant="body2" color="text.secondary">
              כשהאפשרות כבויה, טורנירים גלויים רק למנהלים, ליוצרי טורנירים ולבעלי תפקיד בטורניר.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
