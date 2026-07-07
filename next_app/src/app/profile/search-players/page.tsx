"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { usersApi } from "@/services/api/users";
import Link from "next/link";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Breadcrumbs from "@mui/material/Breadcrumbs";

// Icons
import SearchIcon from "@mui/icons-material/Search";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CheckIcon from "@mui/icons-material/Check";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import Avatar from "@/components/Avatar";

export default function SearchPlayersPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debouncing logic (300ms)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const data = await usersApi.search(searchQuery, token);
      setResults(data);
    } catch (err: any) {
      console.error("Search failed:", err);
      setError("חיפוש שחקנים נכשל. אנא נסה שנית.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // Run search on initial mount if query exists
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      // Sync URL
      const params = new URLSearchParams(window.location.search);
      if (val) {
        params.set("q", val);
      } else {
        params.delete("q");
      }
      router.replace(`${window.location.pathname}?${params.toString()}`);
      performSearch(val);
    }, 300);
  };

  const handleAddFriend = async (targetUserId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent routing to profile when button is clicked
    e.preventDefault();

    try {
      const token = await getToken();
      if (!token) return;

      await usersApi.sendFriendRequest(targetUserId, token);

      // Update state locally
      setResults(prev =>
        prev.map(item =>
          item.id === targetUserId
            ? { ...item, friendshipStatus: "pending", isRequestSender: true }
            : item
        )
      );
    } catch (err) {
      console.error("Failed to send friend request:", err);
      alert("שליחת בקשת החברות נכשלה.");
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />} sx={{ mb: 3 }}>
        <Link href="/profile" passHref style={{ textDecoration: "none", color: "inherit" }}>
          הפרופיל שלי
        </Link>
        <Typography color="text.primary">חיפוש שחקנים</Typography>
      </Breadcrumbs>

      <Typography variant="h4" fontWeight={800} mb={3}>
        חיפוש שחקנים
      </Typography>

      <TextField
        placeholder="חפש שחקנים לפי שם או כתובת אימייל..."
        value={query}
        onChange={handleInputChange}
        fullWidth
        sx={{ mb: 4, bgcolor: "background.paper", borderRadius: 2 }}
        InputProps={{
          startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
        }}
      />

      {loading && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

      {!loading && !error && results.length === 0 && query.trim() !== "" && (
        <Box textAlign="center" py={8} bgcolor="action.hover" borderRadius={3}>
          <Typography color="text.secondary">לא נמצאו שחקנים התואמים את החיפוש</Typography>
        </Box>
      )}

      {!loading && !error && results.length > 0 && (
        <Grid container spacing={3}>
          {results.map((player) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={player.id}>
              <Link href={`/users/${player.id}`} style={{ textDecoration: "none" }}>
                <Card 
                  elevation={2} 
                  sx={{ 
                    height: "100%", 
                    display: "flex", 
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: 4,
                      cursor: "pointer"
                    }
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar 
                        src={player.imageUrl} 
                        name={player.name || "User"} 
                        alt={player.name || "User"}
                        size="md"
                      />
                      <Box overflow="hidden">
                        <Typography variant="h6" fontWeight={700} noWrap>
                          {player.name || "Unnamed Player"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {player.city || "מיקום לא ידוע"}
                        </Typography>
                      </Box>
                    </Stack>

                    <Box mt={3} display="flex" justifyContent="flex-end">
                      {player.friendshipStatus === "friends" && (
                        <Chip 
                          icon={<CheckIcon fontSize="small" />} 
                          label="חברים" 
                          color="success" 
                          variant="outlined" 
                          size="small" 
                        />
                      )}
                      {player.friendshipStatus === "pending" && (
                        <Chip 
                          icon={<AccessTimeIcon fontSize="small" />} 
                          label={player.isRequestSender ? "נשלחה בקשה" : "התקבלה בקשה"} 
                          color="warning" 
                          variant="outlined" 
                          size="small" 
                        />
                      )}
                      {player.friendshipStatus === "none" && (
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          startIcon={<PersonAddIcon />}
                          onClick={(e) => handleAddFriend(player.id, e)}
                          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
                        >
                          הוסף לחברים
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Link>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
