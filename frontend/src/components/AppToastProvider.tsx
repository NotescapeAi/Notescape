import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function AppToastProvider() {
  return (
    <ToastContainer
      newestOnTop
      limit={3}
      closeButton={false}
      toastClassName="surface border border-token text-main shadow-lg"
      bodyClassName="text-sm font-medium"
    />
  );
}
