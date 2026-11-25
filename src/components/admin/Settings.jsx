import StaffSettings from '../shared/StaffSettings';

export default function Settings(props) {
  return <StaffSettings {...props} storageKey="adminTextSize" avatarPrefix="admin" />;
}
