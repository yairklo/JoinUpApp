const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());

const activeSeries = [
  {
    id: "series-1",
    name: "כדורגל שלישי בערב",
    fieldName: "מגרש הרצליה",
    time: "20:00",
    dayOfWeek: 2,
    subscriberCount: 12,
    sport: "FOOTBALL",
    isSubscribed: false,
  },
  {
    id: "series-2",
    name: "כדורסל יום שני",
    fieldName: "היכל הספורט תל אביב",
    time: "19:30",
    dayOfWeek: 1,
    subscriberCount: 8,
    sport: "BASKETBALL",
    isSubscribed: false,
  },
  {
    id: "series-3",
    name: "טניס בוקר שישי",
    fieldName: "מועדון טניס רמת גן",
    time: "08:00",
    dayOfWeek: 5,
    subscriberCount: 5,
    sport: "TENNIS",
    isSubscribed: false,
  },
];

app.get("/api/series/active", (req, res) => {
  res.json(activeSeries);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = 4001;
app.listen(PORT, () => console.log(`mock backend on ${PORT}`));
