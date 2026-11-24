import { CommonActions } from '@react-navigation/native';
import {
  AppLocation,
  decideNavigation,
  findRouteKey,
  focusedRouteKey,
  locationFromNav,
  previousUrlFromNav,
  stateFromLocation,
  tabsRouteName,
} from './appLocation';

/** Aligne React Navigation sur une adresse (retour navigateur ou lien direct). */
export function applyNavLocation(navigation: any, next: AppLocation) {
  if (!navigation?.getRootState) return;
  const state = navigation.getRootState();
  const current = locationFromNav(state, next.area);
  const decision = decideNavigation(current, next, previousUrlFromNav(state, next.area));
  if (decision.type === 'none') return;
  if (decision.type === 'go-back') {
    navigation.dispatch(CommonActions.goBack());
    return;
  }
  if (decision.type === 'set-params') {
    const key = focusedRouteKey(state);
    const action = CommonActions.setParams(decision.params);
    navigation.dispatch(key ? { ...action, source: key } : action);
    return;
  }
  if (decision.type === 'jump-tab') {
    const key = findRouteKey(state, decision.tab);
    if (key) {
      const action = CommonActions.setParams(decision.params);
      navigation.dispatch({ ...action, source: key });
    }
    if (next.area === 'demo') return;
    navigation.dispatch(
      CommonActions.navigate({
        name: tabsRouteName(next.area),
        params: { screen: decision.tab, params: decision.params },
      }),
    );
    return;
  }
  const nextState = stateFromLocation(next) as never;
  if (typeof navigation.resetRoot === 'function') navigation.resetRoot(nextState);
  else navigation.dispatch(CommonActions.reset(nextState));
}
