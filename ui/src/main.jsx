import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import AddServerView from './views/AddServerView.jsx';
import ManageChannelsView from './views/ManageChannelsView.jsx';
import ChannelMessagesView from './views/ChannelMessagesView.jsx';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <Routes>
                {/* App handles auth + layout */}
                <Route path="/" element={<App />}>
                    {/* inside DashboardLayout */}
                    <Route path="add-server" element={<AddServerView />} />
                    <Route
                        path="manage-channels"
                        element={<ManageChannelsView />}
                    />
                    <Route
                        path="channels/:channelId"
                        element={<ChannelMessagesView />}
                    />
                    {/* optional alias so / also shows manage-channels */}
                    <Route index element={<ManageChannelsView />} />
                </Route>
            </Routes>
        </BrowserRouter>
    </StrictMode>
);
