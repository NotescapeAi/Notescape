import React, { useState, useEffect, ChangeEvent } from "react";
import {
  FaEdit,
  FaEnvelope,
  FaMapMarkerAlt,
  FaSave,
  FaTimes,
  FaImage,
  FaCrown,
  FaCog,
  FaLock,
  FaSignOutAlt,
  FaBook,
  FaTasks,
  FaLayerGroup,
  FaUpload,
} from "react-icons/fa";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

/* ====== MAIN COMPONENT ====== */
export default function Profile(): JSX.Element {
  const location = useLocation();

  const [userData, setUserData] = useState<any>({
    name: "Mahnum Zahid",
    id: "STU-10234",
    email: "mahnum@example.com",
    address: "Karachi, Pakistan",
    photo: "", // no default image
  });

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(userData);
  const [profilePic, setProfilePic] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("profileData");
    if (saved) {
      setUserData(JSON.parse(saved));
      setFormData(JSON.parse(saved));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("profileData", JSON.stringify(formData));
    setUserData(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(userData);
    setIsEditing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePicUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-800">
      {/* ====== SIDEBAR ====== */}
      <aside className="w-64 xl:w-64 bg-gradient-to-b from-indigo-600 to-violet-500 text-white flex flex-col justify-between p-5 sticky top-0 h-screen">
        <div>
          <Link to="/dashboard" className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg font-semibold">
              N
            </div>
            <div className="hidden xl:block">
              <div className="text-lg font-semibold">Notescape</div>
              <div className="text-xs opacity-80">Focus • Learn • Achieve</div>
            </div>
          </Link>

          <nav className="space-y-2 mt-6">
            <SidebarItem
              to="/classes"
              icon={<FaBook />}
              label="Classes"
              active={location.pathname === "/classes"}
            />
            <SidebarItem
              to="/quizzes"
              icon={<FaTasks />}
              label="Quizzes"
              active={location.pathname === "/quizzes"}
            />
            <SidebarItem
              to="/flashcards"
              icon={<FaLayerGroup />}
              label="Flashcards"
              active={location.pathname === "/flashcards"}
            />
            <SidebarItem
              to="/settings"
              icon={<FaCog />}
              label="Settings"
              active={location.pathname === "/settings"}
            />
          </nav>
        </div>

        <div className="space-y-3">
          <Link to="/logout" className="block">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-black/10 hover:bg-white/20 transition">
              <FaSignOutAlt />
              <span className="hidden xl:block">Logout</span>
            </div>
          </Link>
          <div className="text-xs text-white/80 text-center mt-3 hidden xl:block">
            v1.0 • pastel UI
          </div>
        </div>
      </aside>

      {/* ====== PROFILE SECTION ====== */}
      <div className="flex-1 p-10 overflow-y-auto">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-lg p-8">
          {/* PROFILE PICTURE SECTION */}
          <div className="flex flex-col items-center">
            {profilePic ? (
              <img
                src={profilePic}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-4 border-blue-500"
              />
            ) : (
              <label
                htmlFor="profileUpload"
                className="cursor-pointer flex flex-col items-center justify-center w-40 h-40 rounded-full border-2 border-dashed border-gray-400 text-gray-500 hover:text-blue-600 hover:border-blue-400"
              >
                <FaUpload className="text-3xl mb-2" />
                Upload a Profile Picture
                <input
                  type="file"
                  id="profileUpload"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePicUpload}
                />
              </label>
            )}
          </div>

          <h2 className="text-3xl font-bold mt-4 text-gray-800">
            {userData.name}
          </h2>
          <p className="text-gray-500 text-sm font-medium mt-1">
            Student ID: {userData.id}
          </p>

          {/* Editable Info */}
          {isEditing ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 space-y-3"
            >
              <input
                className="border p-3 rounded-lg w-full"
                name="name"
                value={formData.name}
                onChange={handleChange}
              />
              <input
                className="border p-3 rounded-lg w-full"
                name="email"
                value={formData.email}
                onChange={handleChange}
              />
              <input
                className="border p-3 rounded-lg w-full"
                name="address"
                value={formData.address}
                onChange={handleChange}
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCancel}
                  className="bg-gray-200 px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <FaTimes /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
                >
                  <FaSave /> Save
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="mt-6 space-y-2">
              <InfoItem icon={<FaEnvelope />} text={userData.email} />
              <InfoItem icon={<FaMapMarkerAlt />} text={userData.address} />

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
                >
                  <FaEdit /> Edit Profile
                </button>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="mt-8 border-t pt-6">
            <h3 className="font-semibold text-gray-700 mb-4">Account</h3>
            <MenuItem icon={<FaCrown />} label="Upgrade to Pro" />
            <MenuItem icon={<FaCog />} label="Settings" />
            <MenuItem icon={<FaLock />} label="Authentication" />
            <MenuItem
              icon={<FaSignOutAlt />}
              label="Log Out"
              color="text-red-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====== REUSABLE COMPONENTS ====== */

function SidebarItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        active
          ? "bg-white/20 text-white"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <div className="text-lg">{icon}</div>
      <div className="hidden xl:block">{label}</div>
    </Link>
  );
}

function InfoItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-700">
      <span className="text-indigo-500">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <button className="flex items-center justify-between w-full bg-gray-50 hover:bg-indigo-50 transition p-3 rounded-xl mb-2">
      <div className="flex items-center gap-3">
        <span className={`text-indigo-500 ${color || ""}`}>{icon}</span>
        <span className="text-gray-700 font-medium">{label}</span>
      </div>
      <span className="text-gray-400">›</span>
    </button>
  );
}
