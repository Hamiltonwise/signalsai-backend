import { motion } from "framer-motion";
import { ProfileTab } from "../../components/settings/ProfileTab";

export const AccountRoute: React.FC = () => (
  <motion.div
    key="account"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    <ProfileTab />
  </motion.div>
);
