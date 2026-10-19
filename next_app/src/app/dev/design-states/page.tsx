"use client";

import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import HomeHero from "@/components/HomeHero";
import GameHeaderCard from "@/components/GameHeaderCard";
import GameHero from "@/components/GameHero";
import GameActions from "@/components/GameActions";
import GameParticipantsList from "@/components/GameParticipantsList";
import GameLiveSection from "@/components/GameLiveSection";
import GameManagePanel from "@/components/GameManagePanel";
import GameDetailsEditor from "@/components/GameDetailsEditor";
import CancelGameButton from "@/components/CancelGameButton";
import Divider from "@mui/material/Divider";

function isoInDays(days: number): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Cards pass dates as DD/MM/YYYY, same as the feed rails. */
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Internal design QA page: renders the signed-in hero and card/game-hero edge states
 * (today / tomorrow / last spot / full / joined, per sport) with fixed props, so they can be
 * checked at any width without a signed-in account or matching live data. Not linked from nav.
 */
export default function DesignStatesPage() {
  const today = dmy(isoInDays(0));
  const tomorrow = dmy(isoInDays(1));
  const later = dmy(isoInDays(5));

  return (
    <main>
      <Typography variant="overline" sx={{ display: "block", px: 2, pt: 2 }}>
        HomeHero — signed in
      </Typography>
      <HomeHero signedIn />

      <Container maxWidth="md" sx={{ pb: 6 }} dir="rtl">
        <Typography variant="overline" sx={{ display: "block", mb: 1 }}>
          GameHeaderCard states
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ overflowX: "auto", pb: 2, mx: -2, px: 2 }}>
          <GameHeaderCard time="20:00" date={today} title="היום — מקום אחרון" subtitle="ירושלים, אולם הפועל" currentPlayers={9} maxPlayers={10} sport="BASKETBALL" isFriendsOnly={false}>
            <Button size="small" variant="contained">הצטרף</Button>
          </GameHeaderCard>
          <GameHeaderCard time="18:30" date={tomorrow} title="מחר — כמעט מלא" subtitle="תל אביב, גני יהושע" currentPlayers={12} maxPlayers={14} sport="SOCCER" teamSize={7} price={25} />
          <GameHeaderCard time="07:00" date={later} title="רשום — טניס זוגות" subtitle="חיפה, מרכז הטניס" currentPlayers={2} maxPlayers={4} sport="TENNIS" isJoined />
          <GameHeaderCard time="21:00" date={today} title="משחק מלא" subtitle="באר שבע" currentPlayers={10} maxPlayers={10} sport="SOCCER" />
        </Stack>

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          GameHero — last spot, tomorrow
        </Typography>
        <Box>
          <GameHero time="20:45" date={tomorrow} durationHours={1.5} title="כדורסל בארנה" subtitle="ירושלים, מרכז העיר, שטראוס 17" currentPlayers={9} maxPlayers={10} sport="BASKETBALL" teamSize={5}>
            <Button size="small" variant="contained">הצטרף למשחק</Button>
          </GameHero>
        </Box>

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          GameHero — joined, today, series, paid
        </Typography>
        <Box>
          <GameHero time="21:00" date={today} title="כדורגל שישי בצהריים" subtitle="תל אביב, גני יהושע" seriesHref="/series/demo" currentPlayers={11} maxPlayers={14} sport="SOCCER" teamSize={7} price={25} viewerState="joined">
            <Button size="small" variant="outlined" color="error">בטל השתתפות</Button>
          </GameHero>
        </Box>

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          GameHero — full, in 5 days
        </Typography>
        <Box>
          <GameHero time="07:00" date={later} title="טניס זוגות" subtitle="חיפה, מרכז הטניס" currentPlayers={4} maxPlayers={4} sport="TENNIS" />
        </Box>

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          Manager view — GameLiveSection (organizer, pending requests) + GameManagePanel
        </Typography>
        <GameLiveSection
          viewerId="u1"
          canManageSeries
          initialGame={{
            id: "demo",
            time: "20:00",
            date: tomorrow,
            duration: 1.5,
            title: "כדורסל שלישי בערב",
            fieldName: "אולם הפועל",
            fieldLocation: "ירושלים",
            currentPlayers: 6,
            maxPlayers: 10,
            sport: "BASKETBALL",
            teamSize: 5,
            organizerId: "u1",
            pendingRequestCount: 2,
            managers: [{ id: "u2", role: "MANAGER" }],
            participants: [
              { id: "u1", name: "דניאל כהן" },
              { id: "u2", name: "נועה לוי" },
              { id: "u3", name: "איתי מזרחי" },
              { id: "u4", name: "שירה אברהם" },
              { id: "u5", name: "יונתן פרץ" },
              { id: "u6", name: "מאיה ביטון" },
            ],
          }}
        />
        <GameManagePanel>
          <GameDetailsEditor
            gameId="demo"
            initialTime="20:00"
            initialDate={tomorrow}
            initialMaxPlayers={10}
            initialSport="BASKETBALL"
            initialDescription=""
            initialFieldId="f1"
            initialFieldName="אולם הפועל"
            initialFieldLocation="ירושלים"
            initialIsFriendsOnly={false}
            canManage
          />
          <Divider sx={{ my: 2 }} />
          <CancelGameButton gameId="demo" isSeriesGame={false} />
        </GameManagePanel>

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          GameActions — location card
        </Typography>
        <GameActions gameId="demo" fieldName="גני יהושע, תל אביב" lat={32.1} lng={34.81} />

        <Typography variant="overline" sx={{ display: "block", mt: 3, mb: 1 }}>
          GameParticipantsList — roster with open slots
        </Typography>
        <GameParticipantsList
          gameId="demo"
          organizerId="u1"
          initialManagers={[{ id: "u2", role: "MANAGER" }]}
          maxPlayers={14}
          participants={[
            { id: "u1", name: "דניאל כהן" },
            { id: "u2", name: "נועה לוי" },
            { id: "u3", name: "איתי מזרחי" },
            { id: "u4", name: "שירה אברהם" },
            { id: "u5", name: "יונתן פרץ" },
            { id: "u6", name: "מאיה ביטון" },
          ]}
        />
      </Container>
    </main>
  );
}
