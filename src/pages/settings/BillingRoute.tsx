import { motion } from "framer-motion";
import { BillingTab } from "../../components/settings/BillingTab";

export const BillingRoute: React.FC = () => (
  <motion.div
    key="billing"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    <BillingTab />
  </motion.div>
);
