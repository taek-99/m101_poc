import { BrowserRouter, Routes, Route } from "react-router-dom";
import Bald from "./app/Bald";
import Home from "./app/Home";
import Hair from "./app/Hair";
import Poc from "./app/Poc";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/bald" element={<Bald />} />
        <Route path="/hair" element={<Hair />} />
        <Route path="/poc" element={<Poc />} />
      </Routes>
    </BrowserRouter>
  );
}