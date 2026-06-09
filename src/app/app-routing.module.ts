import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { LoginRedirectGuard } from './guards/login-redirect.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'welcome-screen',
    canActivate: [LoginRedirectGuard],
    loadChildren: () => import('./welcome-screen/welcome-screen.module').then(m => m.WelcomeScreenPageModule)
  },
  {
    path: 'login-screen',
    canActivate: [LoginRedirectGuard],
    loadChildren: () => import('./auth/login/login-screen/login-screen.module').then(m => m.LoginScreenPageModule)
  },
  {
    path: 'home-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./home-screen/home-screen.module').then(m => m.HomeScreenPageModule)
   
    //  loadChildren: () => import('./contact-sync/pages/contact-sync-test/contact-sync-test.module').then( m => m.ContactSyncTestPageModule)
  },
  {
    path: 'ai-chat',
    canActivate: [AuthGuard],
    loadChildren: () => import('./user-screens/ai-chat-screen/ai-chat-screen.module').then(m => m.AiChatScreenPageModule)
  },
  {
    path: 'chatting-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./user-screens/chatting-screen/chatting-screen.module').then(m => m.ChattingScreenPageModule)
  },
  {
    path: 'calling-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./user-screens/voice-call/calling-screen/calling-screen.module').then(m => m.CallingScreenPageModule)
  },
  {
    path: 'calls-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./user-screens/voice-call/calls-screen/calls-screen.module').then(m => m.CallsScreenPageModule)
  },
  {
    path: 'status-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./status-screens/status-screen/status-screen.module').then(m => m.StatusScreenPageModule)
  },
  {
    path: 'setting-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./setting-screen/setting-screen.module').then(m => m.SettingScreenPageModule)
  },
  {
    path: 'see-status-screen',
    canActivate: [AuthGuard],
    loadChildren: () => import('./status-screens/see-status-screen/see-status-screen.module').then(m => m.SeeStatusScreenPageModule)
  },
  {
    path: 'profile-setup',
    canActivate: [AuthGuard],
    loadComponent: () => import('./components/profile-setup/profile-setup.page').then(m => m.ProfileSetupPage)
  },
  {
    path: 'contact-screen',
    canActivate: [AuthGuard],
    loadComponent: () => import('./contact-screen/contacts.page').then(m => m.ContactsPage)
  },
  {
    path: 'community-screen',
    canActivate: [AuthGuard],  
    loadComponent: () => import('./community/community-screen/community.page').then(m => m.CommunityPage)
  },
  // {
  //   path: 'community-new',
  //   // canActivate: [AuthGuard],  
  //   loadComponent: () => import('./community-new/community-1.page').then(m => m.Community1Page)
  // },
  {
    path: 'profile-screen',
    canActivate: [AuthGuard],
    loadComponent: () => import('./profile-screen/userabout.page').then(m => m.UseraboutPage)
  },
  {
    path: 'change-group-name',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/change-group-name/change-group-name.module').then( m => m.ChangeGroupNamePageModule)
  },
  {
    path: 'add-members',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/add-members/add-members.module').then( m => m.AddMembersPageModule)
  },
  {
    path: 'view-past-members',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/view-past-members/view-past-members.module').then( m => m.ViewPastMembersPageModule)
  },
  {
    path: 'group-description',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/group-description/group-description.module').then( m => m.GroupDescriptionPageModule)
  },
  {
    path: 'attachment-preview',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/attachment-preview/attachment-preview.module').then( m => m.AttachmentPreviewPageModule)
  },
  {
    path: 'forwardmessage',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/forwardmessage/forwardmessage/forwardmessage.module').then( m => m.ForwardmessagePageModule)
  },
  {
    path: 'setting-profile',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/setting-profile/setting-profile.module').then( m => m.SettingProfilePageModule)
  },
  {
    path: 'profile-dp-view',
    loadChildren: () => import('./pages/profile-dp-view/profile-dp-view.module').then( m => m.ProfileDpViewPageModule)
  },
  {
    path: 'update-username',
    loadChildren: () => import('./pages/update-username/update-username.module').then( m => m.UpdateUsernamePageModule)
  },
  {
    path: 'update-status',
    loadChildren: () => import('./pages/update-status/update-status.module').then( m => m.UpdateStatusPageModule)
  },
  {
    path: 'social-media-links',
    loadChildren: () => import('./pages/social-media-links/social-media-links.module').then( m => m.SocialMediaLinksPageModule)
  },
  {
    path: 'add-instagram',
    loadChildren: () => import('./pages/add-instagram/add-instagram.module').then( m => m.AddInstagramPageModule)
  },
  {
    path: 'new-community-form',
    loadChildren: () => import('./community/pages/new-community-form/new-community-form.module').then( m => m.NewCommunityFormPageModule)
  },
  {
    path: 'new-community',
    loadChildren: () => import('./community/pages/new-community/new-community.module').then( m => m.NewCommunityPageModule)
  },
  {
    path: 'community-detail',
    loadChildren: () => import('./community/pages/community-detail/community-detail.module').then( m => m.CommunityDetailPageModule)
  },
  {
    path: 'add-group-community',
    loadChildren: () => import('./community/pages/add-group-community/add-group-community.module').then( m => m.AddGroupCommunityPageModule)
  },
  {
    path: 'add-existing-groups',
    loadChildren: () => import('./community/pages/add-existing-groups/add-existing-groups.module').then( m => m.AddExistingGroupsPageModule)
  },
  {
    path: 'confirm-add-existing-groups',
    loadChildren: () => import('./community/pages/confirm-add-existing-groups/confirm-add-existing-groups.module').then( m => m.ConfirmAddExistingGroupsPageModule)
  },
  {
    path: 'create-new-group',
    loadChildren: () => import('./community/pages/create-new-group/create-new-group.module').then( m => m.CreateNewGroupPageModule)
  },
  {
    path: 'load-all-members',
    loadChildren: () => import('./community/pages/load-all-members/load-all-members.module').then( m => m.LoadAllMembersPageModule)
  },
  {
    path: 'community-info',
    loadChildren: () => import('./community/pages/community-info/community-info.module').then( m => m.CommunityInfoPageModule)
  },
  {
    path: 'community-chat',
    loadChildren: () => import('./community/pages/community-chat/community-chat.module').then( m => m.CommunityChatPageModule)
  },
  {
    path: 'account',
    canActivate: [AuthGuard],
    loadChildren: () => import('./pages/settings/account/account.module').then( m => m.AccountPageModule)
  },
  {
    path: 'privacy',
    loadChildren: () => import('./pages/settings/privacy/privacy.module').then( m => m.PrivacyPageModule)
  },
  {
    path: 'avatar',
    loadChildren: () => import('./pages/settings/avatar/avatar.module').then( m => m.AvatarPageModule)
  },
  {
    path: 'chats',
    loadChildren: () => import('./pages/settings/chats/chats.module').then( m => m.ChatsPageModule)
  },
  {
    path: 'accessibility',
    loadChildren: () => import('./pages/settings/accessibility/accessibility.module').then( m => m.AccessibilityPageModule)
  },
  {
    path: 'notification',
    loadChildren: () => import('./pages/settings/notification/notification.module').then( m => m.NotificationPageModule)
  },
  {
    path: 'storage-data',
    loadChildren: () => import('./pages/settings/storage-data/storage-data.module').then( m => m.StorageDataPageModule)
  },
  {
    path: 'app-language',
    loadChildren: () => import('./pages/settings/app-language/app-language.module').then( m => m.AppLanguagePageModule)
  },
  {
    path: 'help-feedback',
    loadChildren: () => import('./pages/settings/help-feedback/help-feedback.module').then( m => m.HelpFeedbackPageModule)
  },
  {
    path: 'help-center',
    loadChildren: () => import('./pages/settings/pages/help-center/help-center.module').then( m => m.HelpCenterPageModule)
  },
  {
    path: 'app-updates',
    loadChildren: () => import('./pages/settings/app-updates/app-updates.module').then( m => m.AppUpdatesPageModule)
  },
  {
    path: 'invite-friend',
    loadChildren: () => import('./pages/settings/invite-friend/invite-friend.module').then( m => m.InviteFriendPageModule)
  },
  {
    path: 'email-edit',
    loadChildren: () => import('./pages/settings/email-edit/email-edit.module').then( m => m.EmailEditPageModule)
  },
  {
    path: 'message-info',
    loadChildren: () => import('./pages/message-info/message-info.module').then( m => m.MessageInfoPageModule)
  },
  {
    path: 'archieved-screen',
    loadChildren: () => import('./pages/archieved-screen/archieved-screen.module').then( m => m.ArchievedScreenPageModule)
  },
  {
    path: 'theme',
    loadChildren: () => import('./settings/chats/theme/theme.module').then( m => m.ThemePageModule)
  },
  {
    path: 'edit-community-info',
    loadChildren: () => import('./community/pages/edit-community-info/edit-community-info.module').then( m => m.EditCommunityInfoPageModule)
  },
  {
    path: 'add-members-community',
    loadChildren: () => import('./community/pages/add-members-community/add-members-community.module').then( m => m.AddMembersCommunityPageModule)
  },

  {
    path: 'channels',
    loadChildren: () => import('./pages/channels/channels/channels.module').then( m => m.ChannelsPageModule)
  },
    {
    path: 'explore',
    loadChildren: () => import('./pages/channels/explore/explore.module').then( m => m.ExplorePageModule)
  },
  {
    path: 'channel-detail',
    loadChildren: () => import('./pages/channels/channel-detail/channel-detail.module').then( m => m.ChannelDetailPageModule)
  },
  {
    path: 'channel-feed',
    loadChildren: () => import('./pages/channels/channel-feed/channel-feed.module').then( m => m.ChannelFeedPageModule)
  },
  {
    path: 'channel-all',
    loadChildren: () => import('./pages/channels/channel-all/channel-all.module').then( m => m.ChannelAllPageModule)
  },
  {
    path: 'select-contact-list',
    loadChildren: () => import('./pages/select-contact-list/select-contact-list.module').then( m => m.SelectContactListPageModule)
  },
  {
    path: 'add-select-members',
    loadChildren: () => import('./pages/add-select-members/add-select-members.module').then( m => m.AddSelectMembersPageModule)
  },
  {
    path: 'select-add-and-create-group',
    loadChildren: () => import('./pages/select-add-and-create-group/select-add-and-create-group.module').then( m => m.SelectAddAndCreateGroupPageModule)
  },
  {
    path: 'select-new-owner',
    loadChildren: () => import('./community/pages/select-new-owner/select-new-owner.module').then( m => m.SelectNewOwnerPageModule)
  },
  {
    path: 'contact-sync-test',
    loadChildren: () => import('./contact-sync/pages/contact-sync-test/contact-sync-test.module').then( m => m.ContactSyncTestPageModule)
  },
  {
    path: 'broadcast-list',
    loadChildren: () => import('./broadcast/broadcast-list/broadcast-list.module').then( m => m.BroadcastListPageModule)
  },
  {
    path: 'select-broadcast-members',
    loadChildren: () => import('./broadcast/pages/select-broadcast-members/select-broadcast-members.module').then( m => m.SelectBroadcastMembersPageModule)
  },
  {
    path: 'disappearing-messages',
    loadChildren: () => import('./pages/disappearing-messages/disappearing-messages.module').then( m => m.DisappearingMessagesPageModule)
  },
  {
    path: 'default-message-timer',
    loadChildren: () => import('./pages/default-message-timer/default-message-timer.module').then( m => m.DefaultMessageTimerPageModule)
  },
  {
    path: 'manage-favorite',
    loadChildren: () => import('./pages/add-to-favorite/manage-favorite/manage-favorite.module').then( m => m.ManageFavoritePageModule)
  },
  {
    path: 'edit-favorite',
    loadChildren: () => import('./pages/add-to-favorite/edit-favorite/edit-favorite.module').then( m => m.EditFavoritePageModule)
  },
  {
    path: 'add-selected-contact-in-list',
    loadChildren: () => import('./pages/add-selected-contact-in-list/add-selected-contact-in-list.module').then( m => m.AddSelectedContactInListPageModule)
  },
    {
    path: 'banned-account',
    loadComponent: () => import('./pages/banned-account/banned-account.page').then(m => m.BannedAccountPage)
  },
  {
    path: 'manage-list',
    loadChildren: () => import('./pages/add-to-list/manage-list/manage-list.module').then( m => m.ManageListPageModule)
  },
  {
    path: 'group-permissions',
    loadChildren: () => import('./pages/group-permissions/group-permissions.module').then( m => m.GroupPermissionsPageModule)
  },
  {
    path: 'community-settings',
    loadChildren: () => import('./community/pages/community-settings/community-settings.module').then( m => m.CommunitySettingsPageModule)
  },
  {
    path: 'pending-groups',
    loadChildren: () => import('./community/pages/pending-groups/pending-groups.module').then( m => m.PendingGroupsPageModule)
  },
  {
    path: 'community-members',
    loadChildren: () => import('./community/pages/community-members/community-members.module').then( m => m.CommunityMembersPageModule)
  },
  {
    path: 'chat-notifications',
    loadChildren: () => import('./pages/chat-notifications/chat-notifications.module').then( m => m.ChatNotificationsPageModule)
  },
  {
    path: 'help-article',
    loadChildren: () => import('./pages/help-article/help-article.module').then( m => m.HelpArticlePageModule)
  },
  {
    path: 'app-info',
    loadChildren: () => import('./settings/pages/app-info/app-info.module').then( m => m.AppInfoPageModule)
  },
  {
    path: 'add-contact',
    loadChildren: () => import('./contact-screen/pages/add-contact/add-contact.module').then( m => m.AddContactPageModule)

  }

  
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule]
})
export class AppRoutingModule {}