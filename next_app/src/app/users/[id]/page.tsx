import Avatar from "@/components/Avatar";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";

// Icons
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EmailIcon from '@mui/icons-material/Email';
import { SPORT_MAPPING } from "@/utils/sports";
import UserProfileActions from "@/components/UserProfileActions";

// ... existing code down to the Stack ...

                        <Stack spacing={3} textAlign="left">

                            {/* Contact */}
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                    Contact
                                </Typography>
                                <Stack direction="row" alignItems="center" gap={1.5} mt={1}>
                                    <EmailIcon color="action" fontSize="small" />
                                    <Typography variant="body1">{u.email || "No email visible"}</Typography>
                                </Stack>
                            </Box>

                            {/* Age */}
                            {u.age && (
                                <Box>
                                    <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                        Age
                                    </Typography>
                                    <Typography variant="body1">{u.age}</Typography>
                                </Box>
                            )}

                            {/* Sports & Positions */}
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase" gutterBottom>
                                    Sports & Positions
                                </Typography>
                                {(u.sports && u.sports.length > 0) ? (
                                    <Stack spacing={2} mt={1}>
                                        {u.sports.map((s) => {
                                            const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                                            const positions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                            return (
                                                <Box key={s.id} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                                    <Chip 
                                                        label={hebrewName} 
                                                        color="primary" 
                                                        icon={<SportsSoccerIcon />} 
                                                    />
                                                    {positions.map((pos, i) => (
                                                        <Chip 
                                                            key={i} 
                                                            label={pos} 
                                                            size="small" 
                                                            variant="outlined" 
                                                            color="primary" 
                                                        />
                                                    ))}
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">-</Typography>
                                )}
                            </Box>

                        </Stack>

                    </CardContent>
                </Card>
            </Container>
        </main>
    );
}