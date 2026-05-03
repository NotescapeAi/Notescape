import { toast, type ToastOptions } from "react-toastify";

export type AppToastKind = "success" | "error" | "info" | "loading";

const toastOptions: ToastOptions = {
  position: "bottom-right",
  autoClose: 3200,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
};

export function showAppToast(message: string, kind: AppToastKind = "info") {
  if (kind === "loading") {
    toast.info(message, { ...toastOptions, autoClose: 2400 });
    return;
  }
  toast[kind](message, toastOptions);
}
