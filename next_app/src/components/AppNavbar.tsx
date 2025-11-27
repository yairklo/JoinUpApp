"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import AuthButtons from "@/components/AuthButtons";
import { ClerkLoaded, SignedIn } from "@clerk/nextjs";

export default function AppNavbar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <Navbar className="bg-body-tertiary" sticky="top">
      <Container>
        <Navbar.Brand as={Link} href="/" style={{ fontWeight: 800 }}>
          ⚽ JoinUp
        </Navbar.Brand>
        <Nav className="me-auto">
          <Nav.Link as={Link} href="/fields">Fields</Nav.Link>
          <Nav.Link as={Link} href="/games">Active Games</Nav.Link>
        </Nav>
        <div className="d-flex align-items-center gap-3">
          {mounted ? (
            <ClerkLoaded>
              <SignedIn>
                <Link href="/profile" className="nav-link p-0">My Profile</Link>
              </SignedIn>
            </ClerkLoaded>
          ) : null}
          <AuthButtons />
        </div>
      </Container>
    </Navbar>
  );
}


