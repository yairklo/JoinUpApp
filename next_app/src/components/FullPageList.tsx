"use client";

import React from "react";
import Dialog from "@mui/material/Dialog";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import Slide from "@mui/material/Slide";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import { TransitionProps } from "@mui/material/transitions";

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
        children: React.ReactElement<any>;
    },
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

interface FullPageListProps<T> {
    open: boolean;
    onClose: () => void;
    title: string;
    items: T[];
    renderItem: (item: T) => React.ReactNode;
}

export default function FullPageList<T>({
    open,
    onClose,
    title,
    items,
    renderItem,
}: FullPageListProps<T>) {
    return (
        <Dialog
            fullScreen
            open={open}
            onClose={onClose}
            TransitionComponent={Transition}
        >
            <AppBar
                sx={{
                    position: "sticky",
                    top: 0,
                    bgcolor: "background.paper",
                    color: "text.primary",
                    borderBottom: 1,
                    borderColor: "divider",
                    boxShadow: "none",
                }}
            >
                <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
                    <IconButton
                        edge="start"
                        color="inherit"
                        onClick={onClose}
                        aria-label="סגור"
                    >
                        <CloseIcon />
                    </IconButton>
                    <Typography sx={{ marginInlineStart: 1.5, flex: 1 }} variant="h6" component="div" fontWeight={700} noWrap>
                        {title}
                    </Typography>
                </Toolbar>
            </AppBar>
            <Box
                sx={{
                    bgcolor: "background.default",
                    minHeight: "100%",
                    py: { xs: 2, md: 3 },
                    pb: { xs: "calc(24px + env(safe-area-inset-bottom))", md: 3 },
                }}
            >
                <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 } }}>
                    {items.length === 0 ? (
                        <Box textAlign="center" mt={4}>
                            <Typography variant="body1" color="text.secondary">
                                לא נמצאו תוצאות.
                            </Typography>
                        </Box>
                    ) : (
                        <Box
                            display="grid"
                            gap={2}
                            sx={{
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    sm: "repeat(2, 1fr)",
                                },
                            }}
                        >
                            {items.map((item, index) => {
                                const node = renderItem(item);
                                const card = React.isValidElement(node)
                                    ? React.cloneElement(node as React.ReactElement<{ fullWidth?: boolean }>, { fullWidth: true })
                                    : node;
                                return (
                                    <Box key={index} sx={{ minWidth: 0 }}>
                                        {card}
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Container>
            </Box>
        </Dialog>
    );
}
