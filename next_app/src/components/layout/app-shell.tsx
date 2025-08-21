import Navbar from "./navbar";

export default function AppShell({children}:{children:React.ReactNode}){
  return (
    <div className="min-h-screen">
      <Navbar/>
      <div className="container-prose py-6">{children}</div>
    </div>
  );
}


