import { Routes, Route, Navigate } from 'react-router-dom';
import ContentStudioPage from './pages/ContentStudioPage';
import TrendTrackerPage from './pages/TrendTrackerPage';
import CardNewsPage from './pages/CardNewsPage';
import ShortFormPage from './pages/ShortFormPage';
import MemeAdPage from './pages/MemeAdPage';
import AdCopyPage from './pages/AdCopyPage';
import AdCreativePage from './pages/AdCreativePage';
import ThumbnailPage from './pages/ThumbnailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/contents-maker" replace />} />
      <Route path="/contents-maker" element={<ContentStudioPage />} />
      <Route path="/trend-tracker" element={<TrendTrackerPage />} />
      <Route path="/card-news" element={<CardNewsPage />} />
      <Route path="/short-form" element={<ShortFormPage />} />
      <Route path="/meme-ad" element={<MemeAdPage />} />
      <Route path="/ad-copy" element={<AdCopyPage />} />
      <Route path="/ad-creative" element={<AdCreativePage />} />
      <Route path="/thumbnail" element={<ThumbnailPage />} />
    </Routes>
  );
}
