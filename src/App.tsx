import { BrowserRouter, Routes, Route } from "react-router-dom";
import Bald from "./app/Bald";
import Home from "./app/Home";
import Hair from "./app/Hair";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/bald" element={<Bald />} />
        <Route path="/hair" element={<Hair />} />
      </Routes>
    </BrowserRouter>
  );
}