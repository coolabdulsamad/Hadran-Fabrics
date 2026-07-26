import { useCallback } from "react";

/**
 * HADRAN FABRICS MALL — receipt printer hook.
 *
 * Prints the .receipt-print-area element via the browser's print pipeline
 * (works with any thermal printer the OS knows — 80mm styles are in index.css).
 *
 * The paper-check flow: the caller shows a "printer ready?" confirmation
 * first (hardware.printer_paper_check setting), then calls print().
 * print() resolves when the print dialog closes (afterprint) so the UI
 * can offer "Did it print? / Reprint" handling.
 */
export function usePrinter() {
  const print = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener("afterprint", finish);
        resolve();
      };
      window.addEventListener("afterprint", finish);
      // Fallback: some browsers don't fire afterprint reliably
      setTimeout(finish, 1500);
      window.print();
    });
  }, []);

  return { print };
}
