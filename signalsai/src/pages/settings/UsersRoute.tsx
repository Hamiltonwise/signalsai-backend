import { motion } from "framer-motion";
import { UsersTab } from "../../components/settings/UsersTab";

export const UsersRoute: React.FC = () => (
  <motion.div
    key="users"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    <UsersTab />
  </motion.div>
);
