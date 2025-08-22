// client/src/pages/Classes.tsx
import { useState, useEffect } from "react";
import axios from "axios";

export default function Classes() {
  const [classes, setClasses] = useState<any[]>([]);
  const [newClass, setNewClass] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // ✅ Fetch classes from backend
  useEffect(() => {
    axios.get("http://localhost:5000/api/classes").then((res) => {
      setClasses(res.data);
    });
  }, []);

  // ✅ Add new class
  const addClass = async () => {
    if (!newClass.trim()) return;
    const res = await axios.post("http://localhost:5000/api/classes", {
      name: newClass,
    });
    setClasses([...classes, res.data]);
    setNewClass("");
  };

  // ✅ Start editing
  const startEdit = (cls: any) => {
    setEditingId(cls.id);
    setEditValue(cls.name);
  };

  // ✅ Save edit
  const saveEdit = async (id: number) => {
    await axios.put(`http://localhost:5000/api/classes/${id}`, {
      name: editValue,
    });
    setClasses(
      classes.map((cls) =>
        cls.id === id ? { ...cls, name: editValue } : cls
      )
    );
    setEditingId(null);
    setEditValue("");
  };

  // ✅ Delete class
  const deleteClass = async (id: number) => {
    await axios.delete(`http://localhost:5000/api/classes/${id}`);
    setClasses(classes.filter((cls) => cls.id !== id));
  };

  return (
    <div className="p-6 w-full">
      <h1 className="text-2xl font-bold mb-4">📚 Classes Dashboard</h1>

      {/* Add new class */}
      <div className="flex mb-4">
        <input
          type="text"
          value={newClass}
          onChange={(e) => setNewClass(e.target.value)}
          placeholder="Enter new class name"
          className="border p-2 rounded w-full"
        />
        <button
          onClick={addClass}
          className="ml-2 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add
        </button>
      </div>

      {/* Classes list */}
      <ul className="space-y-2">
        {classes.map((cls) => (
          <li
            key={cls.id}
            className="flex justify-between items-center border p-2 rounded"
          >
            {editingId === cls.id ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="border p-1 rounded w-full"
              />
            ) : (
              <span>{cls.name}</span>
            )}

            <div className="space-x-2">
              {editingId === cls.id ? (
                <button
                  onClick={() => saveEdit(cls.id)}
                  className="bg-green-500 text-white px-3 py-1 rounded"
                >
                  Save
                </button>
              ) : (
                <button
                  onClick={() => startEdit(cls)}
                  className="bg-yellow-500 text-white px-3 py-1 rounded"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => deleteClass(cls.id)}
                className="bg-red-500 text-white px-3 py-1 rounded"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
