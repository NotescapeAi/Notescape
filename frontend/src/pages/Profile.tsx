import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FaEdit, FaUpload, FaEnvelope, FaPhone, FaMapMarkerAlt, FaCalendarAlt } from "react-icons/fa";

export default function Profile(): JSX.Element {
  const [userData, setUserData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    bio: "",
    profilePic: null,
  });
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user data from backend when the page loads
    fetch("/api/user/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setUserData(data);
        setFormData({
          name: data.name,
          email: data.email,
          phone: data.phone,
          location: data.location,
          bio: data.bio,
          profilePic: data.profilePic || null,
        });
        setProfilePicPreview(data.profilePic || null);
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }, []);

  // Handle input changes for text fields
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  // Handle textarea changes for bio
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  // Handle profile picture change
  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicPreview(reader.result as string);
        setFormData({ ...formData, profilePic: file });
      };
      reader.readAsDataURL(file);
    }
  };

  // Form submission logic
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare FormData to send
    const fd = new FormData();
    for (const key in formData) {
      if (formData[key as keyof typeof formData]) {
        fd.append(key, formData[key as keyof typeof formData] as any);
      }
    }

    // Debugging: Log the data being sent
    console.log("Submitting FormData:", formData);

    fetch("/api/user/profile", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      },
      body: fd, // Sending FormData directly
    })
      .then((res) => {
        // Check if the response status is successful
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Handle successful response
        console.log("Profile updated successfully:", data);
        setUserData(data); // Update the user data after successful submission
        setIsEditing(false); // Exit edit mode
      })
      .catch((err) => {
        // Handle error response
        console.error("Error updating profile:", err);
        alert("Error updating profile. Please try again.");
      });
  };

  // Loading state if user data hasn't loaded yet
  if (!userData) return <div className="text-center mt-10 text-gray-600">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto flex justify-between items-center px-6 py-4">
          <Link
            to="/dashboard"
            className="text-sm px-3 py-1 border rounded-lg text-gray-700 hover:bg-gray-100 transition"
          >
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-800">My Profile</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-md border p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="relative w-32 h-32">
            {profilePicPreview ? (
              <img
                src={profilePicPreview}
                alt="Profile"
                className="w-full h-full object-cover rounded-full border"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-b from-indigo-500 to-purple-500 flex items-center justify-center text-white text-3xl font-bold">
                {formData.name?.[0] || "U"}
              </div>
            )}
            {isEditing && (
              <label className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full cursor-pointer hover:bg-indigo-700">
                <FaUpload />
                <input type="file" onChange={handleProfilePicChange} className="hidden" />
              </label>
            )}
          </div>

          <div className="flex-1 space-y-2">
            {isEditing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="text-2xl font-semibold border-b focus:outline-none focus:border-indigo-500"
              />
            ) : (
              <h2 className="text-2xl font-semibold text-gray-900">{userData.name}</h2>
            )}
            <p className="text-sm text-gray-500">{userData.role}</p>
            {isEditing ? (
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleTextareaChange}
                className="w-full mt-3 border p-2 rounded-md text-gray-700 focus:ring-2 focus:ring-indigo-500"
                placeholder="Write a short bio..."
              />
            ) : (
              <p className="text-gray-700 mt-3 leading-relaxed">{userData.bio || "No bio added yet."}</p>
            )}
          </div>

          <div>
            <button
              onClick={() => (isEditing ? handleFormSubmit(new Event("submit") as any) : setIsEditing(true))}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition ${
                isEditing
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border text-gray-700 hover:bg-gray-100"
              }`}
            >
              <FaEdit />
              {isEditing ? "Save Changes" : "Edit Profile"}
            </button>
          </div>
        </div>

        {/* Details Section */}
        {!isEditing && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 grid sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3 text-gray-700">
              <FaEnvelope className="text-indigo-600" /> {userData.email}
            </div>
            <div className="flex items-center gap-3 text-gray-700">
              <FaPhone className="text-indigo-600" /> {userData.phone || "Not provided"}
            </div>
            <div className="flex items-center gap-3 text-gray-700">
              <FaMapMarkerAlt className="text-indigo-600" /> {userData.location || "Unknown"}
            </div>
            <div className="flex items-center gap-3 text-gray-700">
              <FaCalendarAlt className="text-indigo-600" /> Member since 2025
            </div>
          </div>
        )}

        {/* Edit Form */}
        {isEditing && (
          <form onSubmit={handleFormSubmit} className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-gray-600">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full mt-2 border rounded-lg p-3 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full mt-2 border rounded-lg p-3 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600">Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full mt-2 border rounded-lg p-3 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Save All Changes
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
