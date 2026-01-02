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
            <AppBar sx={{ position: "relative" }}>
                <Toolbar>
                    <IconButton
                        edge="start"
                        color="inherit"
                        onClick={onClose}
                        aria-label="close"
                    >
                        <CloseIcon />
                    </IconButton>
                    <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                        {title}
                    </Typography>
                </Toolbar>
            </AppBar>
            <Box sx={{ bgcolor: "background.default", minHeight: "100vh", py: 3 }}>
                <Container maxWidth="md">
                    {items.length === 0 ? (
                        <Box textAlign="center" mt={4}>
                            <Typography variant="body1" color="text.secondary">
                                No items found.
                            </Typography>
                        </Box>
                    ) : (
                        <Box display="flex" flexWrap="wrap" gap={2}>
                            {items.map((item, index) => (
                                <Box key={index} sx={{ width: { xs: "100%", sm: "calc(50% - 8px)" } }}>
                                    {renderItem(item)}
                                </Box>
                            ))}
                        </Box>
                    )}
                </Container>
            </Box>
        </Dialog>
    );
}
