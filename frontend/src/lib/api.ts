import axios from "axios";

const API_BASE_URL = "http://localhost:8000"; // change if your backend is hosted elsewhere

export async function listFlashcards() {
  const response = await axios.get(`${API_BASE_URL}/flashcards`);
  return response.data;
}

export async function createFlashcard(data: { question: string; answer: string }) {
  const response = await axios.post(`${API_BASE_URL}/flashcards`, data);
  return response.data;
}

export async function updateFlashcard(id: number, data: { question: string; answer: string }) {
  const response = await axios.put(`${API_BASE_URL}/flashcards/${id}`, data);
  return response.data;
}

export async function deleteFlashcard(id: number) {
  const response = await axios.delete(`${API_BASE_URL}/flashcards/${id}`);
  return response.data;
}
