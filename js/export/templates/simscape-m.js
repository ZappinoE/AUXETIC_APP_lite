/* script MATLAB generato nell'export Simscape (tubo_simscape.m); String.raw: il testo è quello del file .m */
const SIMSCAPE_M=String.raw`function out = tubo_simscape(caso, riga, varargin)
%TUBO_SIMSCAPE  Modello a corpi rigidi del Tubo Auxetico in Simscape Multibody (dati esportati dal tool).
%
%   out = tubo_simscape('cella', 7)   cella periodica della riga 7 (file celle/cella_riga07.json)
%   out = tubo_simscape('tubo')       tubo intero senza bladder (file tubo_intero.json)
%
%   Opzioni (coppie nome/valore):
%     'Cartella'  cartella con i JSON (default: quella dello script)
%     'Simula'    true/false (default true): false costruisce solo il modello .slx
%     'Apri'      true/false (default false): apre il modello in Simulink
%     'TFinale'   durata della simulazione [s] (default: quella del file)
%     'Explorer'  true/false (default true): false non apre Mechanics Explorer (lanci in batch)
%
%   Modello:
%   - ogni poligono rotante e ogni Y e un corpo rigido (una piastra estrusa per pezzo, densita del file);
%   - ogni cerniera e un Bushing Joint nel punto di cerniera con z = normale al guscio:
%     k sulle 3 traslazioni, k_b sulle rotazioni attorno a x e y, k_theta attorno a z, smorzamento = damping * k;
%   - cella: ogni Y e guidata da 3 giunti prismatici (x, y, z) con moto imposto (traslazione affine, nessuna
%     rotazione): sono le condizioni periodiche del modello a corpi rigidi; poligoni liberi. Si misura il lavoro
%     dei moti (= energia elastica + dissipazione) e il volume del periodo: p = dW/dV, confrontata con il tool;
%   - tubo: estremita come nel tool (perni sui bulkhead, oppure vincoli a penalita), pressione follower per corpo
%     (rampa, mantenimento, discesa), spinta sul fondo con le estremita chiuse.
%
%   Uscite: struttura out con i risultati; file risultati_*.mat e grafici *.png nella cartella.

  if nargin < 1, caso = 'cella'; end
  if nargin < 2 || isempty(riga), riga = 1; end
  o = struct('Cartella', fileparts(mfilename('fullpath')), 'Simula', true, 'Apri', false, 'TFinale', [], 'Explorer', true);
  for k = 1:2:numel(varargin), o.(varargin{k}) = varargin{k+1}; end

  switch lower(caso)
    case 'cella', file = fullfile(o.Cartella, 'celle', sprintf('cella_riga%02d.json', riga)); mdl = sprintf('tubo_cella_riga%02d', riga);
    case 'tubo',  file = fullfile(o.Cartella, 'tubo_intero.json'); mdl = 'tubo_intero';
    otherwise, error('caso deve essere ''cella'' o ''tubo''');
  end
  M = jsondecode(fileread(file));
  fprintf('%s: %d corpi, %d cerniere\n', mdl, numel(M.bodies), numel(M.hinges));

  if bdIsLoaded(mdl), close_system(mdl, 0); end
  if exist(fullfile(o.Cartella, [mdl '.slx']), 'file'), delete(fullfile(o.Cartella, [mdl '.slx'])); end
  new_system(mdl); load_system('sm_lib'); load_system('nesl_utility'); load_system('simulink');
  W = struct('mdl', mdl, 'n', 0);
  ws = get_param(mdl, 'ModelWorkspace');

  % --- ambiente: mondo, configurazione del meccanismo (senza gravita), solutore
  world = addb(W, 'sm_lib/Frames and Transforms/World Frame', 'Mondo');
  if ~o.Explorer, setp(mdl, 'SimMechanicsOpenEditorOnUpdate', 'off'); end   % il parametro esiste solo con blocchi Multibody nel modello
  mech  = addb(W, 'sm_lib/Utilities/Mechanism Configuration', 'Meccanismo');
  setp(mech, 'GravityVector', '[0 0 0]');
  solv  = addb(W, 'nesl_utility/Solver Configuration', 'Solutore');
  conn(W, pc(world,'R',1), pc(mech,'L',1)); conn(W, pc(world,'R',1), pc(solv,'R',1));
  WF = pc(world, 'R', 1);

  % --- corpi: telaio di riferimento di ogni corpo = telaio del mondo nella configurazione chiusa
  nb = numel(M.bodies); BF = zeros(nb, 1);
  for i = 1:nb
    b = getb(M.bodies, i);
    pcs = b.pieces;
    for k = 1:numel(pcs)
      V = getb(pcs, k).v; if size(V, 2) ~= 3, V = V.'; end
      [Rp, c, XY] = pianoPezzo(V);
      t = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('T_%s_%d', b.name, k));
      setT(t, Rp, c);
      s = addb(W, 'sm_lib/Body Elements/Extruded Solid', sprintf('S_%s_%d', b.name, k));
      setp(s, 'ExtrusionType', 'General');
      setq(s, {'ExtrusionCrossSection', 'CrossSection'}, mat2str(XY, 9)); setq(s, {'ExtrusionLength', 'Length'}, num2str(M.thickness, 9));
      setv(s, 'InertiaType', {'CalculateFromGeometry', 'Calculate from Geometry'}); setp(s, 'BasedOnType', 'Density', 'Density', num2str(M.density, 9));
      if strcmp(b.kind, 'ROT'), col = '[0.85 0.55 0.25]'; else, col = '[0.55 0.65 0.78]'; end
      trysetp(s, 'GraphicDiffuseColor', col);
      if k == 1, BF(i) = pc(t, 'L', 1); else, conn(W, BF(i), pc(t, 'L', 1)); end   % telaio del corpo = base del primo pezzo
      conn(W, pc(t, 'R', 1), pc(s, 'L', 1));
    end
  end
  % telaio di riferimento di ogni corpo = telaio del mondo nella configurazione chiusa; ogni corpo e collegato al
  % mondo da una catena di giunti (cerniere, perni, moti delle Y), quindi non ci sono corpi liberi.

  % --- cerniere: Bushing Joint fra un telaio del poligono e uno della Y, coincidenti nella configurazione chiusa
  nh = numel(M.hinges); c = M.damping;
  for h = 1:nh
    H = getb(M.hinges, h);
    ta = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Ha%d', h)); setT(ta, H.R, H.p(:));
    tb = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Hb%d', h)); setT(tb, H.R, H.p(:));
    conn(W, BF(H.a), pc(ta, 'L', 1)); conn(W, BF(H.b), pc(tb, 'L', 1));
    bj = addb(W, 'sm_lib/Joints/Bushing Joint', sprintf('Cerniera%d', h));
    molla(bj, {'Px','Py','Pz'}, H.k, c*H.k);
    molla(bj, {'Rx','Ry'}, H.kb, c*H.kb);
    molla(bj, {'Rz'}, H.kth, c*H.kth);
    conn(W, pc(ta, 'R', 1), pc(bj, 'L', 1)); conn(W, pc(tb, 'R', 1), pc(bj, 'R', 1));
  end

  if strcmpi(caso, 'cella')
    out = cella(W, M, BF, WF, ws, o);
  else
    out = tubo(W, M, BF, WF, ws, o);
  end
end

% =====================================================================================================
function out = cella(W, M, BF, WF, ws, o)
  d = M.drive; T = d.t(end); if ~isempty(o.TFinale), T = o.TFinale; end
  assignin(ws, 'LU_TAB', [d.t(:) d.lu(:)]); assignin(ws, 'LV_TAB', [d.t(:) d.lv(:)]);
  lu = addb(W, 'simulink/Sources/From Workspace', 'LU'); setp(lu, 'VariableName', 'LU_TAB', 'Interpolate', 'on', 'OutputAfterFinalValue', 'Holding final value');
  lv = addb(W, 'simulink/Sources/From Workspace', 'LV'); setp(lv, 'VariableName', 'LV_TAB', 'Interpolate', 'on', 'OutputAfterFinalValue', 'Holding final value');
  pw = {};   % segnali di potenza dei moti
  for i = 1:numel(M.ydrive)
    y = getb(M.ydrive, i); X = y.X(:); prev = WF;
    ax = {'x','y','z'}; Rax = {[0 0 1; 0 1 0; -1 0 0], [1 0 0; 0 0 1; 0 -1 0], eye(3)};   % z del giunto lungo x, y, z globali
    for a = 1:3
      % catena mondo -> DX -> DY -> Y: telai al nodo della Y con z lungo l'asse di scorrimento
      tA = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('G%d%s_b', i, ax{a})); setT(tA, Rax{a}, X);
      conn(W, prev, pc(tA, 'L', 1));
      pj = addb(W, 'sm_lib/Joints/Prismatic Joint', sprintf('Moto_Y%d_%s', i, ax{a}));
      setp(pj, 'MotionActuationMode', 'InputMotion'); setq(pj, {'TorqueActuationMode', 'ForceActuationMode'}, {'ComputedTorque', 'ComputedForce'});
      setp(pj, 'SenseVelocity', 'on'); setq(pj, {'SenseTorqueForce', 'SenseActuatorForce'}, 'on');
      conn(W, pc(tA, 'R', 1), pc(pj, 'L', 1));
      tB = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('G%d%s_f', i, ax{a})); setT(tB, Rax{a}.', -Rax{a}.'*X);   % ritorno al telaio del mondo
      conn(W, pc(pj, 'R', 1), pc(tB, 'L', 1));
      if a < 3
        % corpo ausiliario di massa trascurabile
        in = addb(W, 'sm_lib/Body Elements/Inertia', sprintf('Aux%d%s', i, ax{a}));
        setp(in, 'Mass', '1e-3'); trysetp(in, 'MomentsOfInertia', '[1e-6 1e-6 1e-6]');
        conn(W, pc(tB, 'R', 1), pc(in, 'L', 1)); prev = pc(tB, 'R', 1);
      else
        conn(W, pc(tB, 'R', 1), BF(y.body));
      end
      % moto: (lambda - 1) * coordinata del nodo
      g = addb(W, 'simulink/Math Operations/Bias', sprintf('B%d%s', i, ax{a})); setp(g, 'Bias', '-1');
      k = addb(W, 'simulink/Math Operations/Gain', sprintf('K%d%s', i, ax{a})); setp(k, 'Gain', num2str(X(a), 12));
      cv = addb(W, 'nesl_utility/Simulink-PS Converter', sprintf('C%d%s', i, ax{a}));
      setp(cv, 'Unit', 'm'); trysetp(cv, 'FilteringAndDerivatives', 'filter'); trysetp(cv, 'SimscapeFilterOrder', '2'); trysetp(cv, 'InputFilterTimeConstant', num2str(T/2000));
      if a < 3, src = lu; else, src = lv; end
      wire(W, src, 1, g, 1); wire(W, g, 1, k, 1); wire(W, k, 1, cv, 1);
      conn(W, pc(cv, 'R', 1), pc(pj, 'L', 2));
      % potenza = forza dell'attuatore * velocita
      fs = addb(W, 'nesl_utility/PS-Simulink Converter', sprintf('F%d%s', i, ax{a})); trysetp(fs, 'Unit', 'N');
      vs = addb(W, 'nesl_utility/PS-Simulink Converter', sprintf('V%d%s', i, ax{a})); trysetp(vs, 'Unit', 'm/s');
      [pf, pv] = portSensori(pj);
      conn(W, pf, pc(fs, 'L', 1)); conn(W, pv, pc(vs, 'L', 1));
      pr = addb(W, 'simulink/Math Operations/Product', sprintf('P%d%s', i, ax{a}));
      wire(W, fs, 1, pr, 1); wire(W, vs, 1, pr, 2); pw{end+1} = pr; %#ok<AGROW>
    end
  end
  sm = addb(W, 'simulink/Math Operations/Sum', 'Potenza'); setp(sm, 'Inputs', repmat('+', 1, numel(pw)));
  for i = 1:numel(pw), wire(W, pw{i}, 1, sm, i); end
  it = addb(W, 'simulink/Continuous/Integrator', 'Lavoro');
  wire(W, sm, 1, it, 1);
  tw = @(nm) setp(addb(W, 'simulink/Sinks/To Workspace', ['tw_' nm]), 'VariableName', nm, 'SaveFormat', 'Timeseries');
  tw('W'); tw('LUo'); tw('LVo');
  wire(W, it, 1, [W.mdl '/tw_W'], 1); wire(W, lu, 1, [W.mdl '/tw_LUo'], 1); wire(W, lv, 1, [W.mdl '/tw_LVo'], 1);
  set_param(W.mdl, 'StopTime', num2str(T), 'Solver', 'ode15s', 'MaxStep', num2str(T/400), 'RelTol', '1e-5', 'ReturnWorkspaceOutputs', 'on');
  out = struct('modello', W.mdl);
  save_system(W.mdl, fullfile(o.Cartella, [W.mdl '.slx']));
  if o.Apri, open_system(W.mdl); end
  if ~o.Simula, return; end
  fprintf('simulazione %s (%g s)...\n', W.mdl, T);
  so = sim(W.mdl);
  t = so.W.Time; Wt = so.W.Data(:); LUt = interp1(so.LUo.Time, so.LUo.Data(:), t); LVt = interp1(so.LVo.Time, so.LVo.Data(:), t);
  V = M.Vc * LUt.^2 .* LVt; p = gradient(Wt) ./ max(gradient(V), eps);
  % confronto con il tool: energia del modello periodico (rigidezze k0, k_theta0 del pannello; la riga scala con f)
  f = M.hinges(1).k / d.kTool(1); Et = interp1(d.t, d.Etool, t) * f; pT = interp1(d.t, d.pTool, t) * f;
  out = struct('modello', W.mdl, 't', t, 'lambda_u', LUt, 'lambda_v', LVt, 'V', V, 'W', Wt, 'p', p, 'W_tool', Et, 'p_tool', pT);
  save(fullfile(o.Cartella, ['risultati_' W.mdl '.mat']), '-struct', 'out');
  fg = figure('Visible', 'off', 'Position', [100 100 1100 420]);
  subplot(1, 2, 1); plot(LUt, Wt, 'LineWidth', 1.8); hold on; plot(LUt, Et, '--', 'LineWidth', 1.2); grid on;
  xlabel('\lambda_u (allungamento circonferenziale)'); ylabel('energia [J]'); legend('Simscape (lavoro dei moti)', 'tool (modello periodico)', 'Location', 'best');
  title(sprintf('Cella riga %d: energia', M.row));
  subplot(1, 2, 2); plot(V / M.Vc, p / 101325, 'LineWidth', 1.8); hold on; plot(V / M.Vc, pT / 101325, '--', 'LineWidth', 1.2); grid on;
  xlabel('V / V_0'); ylabel('p [atm]'); legend('Simscape  p = dW/dV', 'tool', 'Location', 'best'); title('Pressione equivalente');
  exportgraphics(fg, fullfile(o.Cartella, ['grafico_' W.mdl '.png']), 'Resolution', 150); close(fg);
  [~, iM] = max(Wt(1:round(end*0.8))); fprintf('energia massima %.4g J a lambda_u %.3f; finale %.4g J\n', Wt(iM), LUt(iM), Wt(end));
end

% =====================================================================================================
function out = tubo(W, M, BF, WF, ws, o)
  pr = M.pressure; T = pr.T1 + pr.Thold + pr.T2; if ~isempty(o.TFinale), T = o.TFinale; end
  % pressione p(t) [Pa]: rampa liscia, mantenimento, discesa
  tt = linspace(0, max(T, pr.T1 + pr.Thold + pr.T2), 801)';
  sstep = @(x) (x <= 0) .* 0 + (x >= 1) .* 1 + (x > 0 & x < 1) .* (x.^2 .* (3 - 2 * x));
  pp = pr.pmax * sstep(tt / pr.T1) - (pr.pmax - pr.pfin) * sstep((tt - pr.T1 - pr.Thold) / pr.T2);
  assignin(ws, 'P_TAB', [tt pp]);
  ps = addb(W, 'simulink/Sources/From Workspace', 'Pressione'); setp(ps, 'VariableName', 'P_TAB', 'Interpolate', 'on', 'OutputAfterFinalValue', 'Holding final value');
  % forze di pressione: una External Force and Torque per corpo, componenti nel corpo (follower)
  for i = 1:numel(M.press)
    q = getb(M.press, i); if norm(q.F) + norm(q.T) < 1e-14, continue; end
    b = getb(M.bodies, q.body);
    t = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', ['Pc_' b.name]); setT(t, eye(3), b.c(:));
    conn(W, BF(q.body), pc(t, 'L', 1));
    ef = addb(W, 'sm_lib/Forces and Torques/External Force and Torque', ['Pf_' b.name]);
    setq(ef, {'EnableForce', 'ForceFlag'}, 'on'); setq(ef, {'EnableTorque', 'TorqueFlag'}, 'on');   % componenti nel telaio del corpo (predefinito)
    [pF, pT, pE] = portForza(ef); conn(W, pc(t, 'R', 1), pE);
    gF = addb(W, 'simulink/Math Operations/Gain', ['gF_' b.name]); setp(gF, 'Gain', mat2str(q.F(:), 12), 'Multiplication', 'Element-wise(K.*u)');
    gT = addb(W, 'simulink/Math Operations/Gain', ['gT_' b.name]); setp(gT, 'Gain', mat2str(q.T(:), 12), 'Multiplication', 'Element-wise(K.*u)');
    cF = addb(W, 'nesl_utility/Simulink-PS Converter', ['cF_' b.name]); setp(cF, 'Unit', 'N');
    cT = addb(W, 'nesl_utility/Simulink-PS Converter', ['cT_' b.name]); setp(cT, 'Unit', 'N*m');
    wire(W, ps, 1, gF, 1); wire(W, ps, 1, gT, 1); wire(W, gF, 1, cF, 1); wire(W, gT, 1, cT, 1);
    conn(W, pc(cF, 'R', 1), pF); conn(W, pc(cT, 'R', 1), pT);
  end
  % estremita
  bulkF = [];
  if isfield(M, 'bulkhead') && ~isempty(M.bulkhead)
    bk = M.bulkhead;
    tz = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', 'Bulk_rif'); setT(tz, eye(3), [0; 0; bk.z]);
    conn(W, WF, pc(tz, 'L', 1));
    pj = addb(W, 'sm_lib/Joints/Prismatic Joint', 'Bulk_scorrevole');
    conn(W, pc(tz, 'R', 1), pc(pj, 'L', 1));
    tb = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', 'Bulk_corpo'); setT(tb, eye(3), [0; 0; -bk.z]);
    conn(W, pc(pj, 'R', 1), pc(tb, 'L', 1)); bulkF = pc(tb, 'R', 1);          % telaio del bulkhead = telaio del mondo a t=0
    td = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', 'Bulk_disco'); setT(td, eye(3), [0; 0; bk.z + bk.thickness/2]);
    conn(W, bulkF, pc(td, 'L', 1));
    cy = addb(W, 'sm_lib/Body Elements/Cylindrical Solid', 'Bulk_solido');
    setp(cy, 'CylinderRadius', num2str(bk.radius, 9), 'CylinderLength', num2str(bk.thickness, 9));
    setv(cy, 'InertiaType', {'CalculateFromGeometry', 'Calculate from Geometry'}); setp(cy, 'BasedOnType', 'Density', 'Density', num2str(M.density, 9));
    conn(W, pc(td, 'R', 1), pc(cy, 'L', 1));
    if isfield(M, 'device') && ~isempty(M.device)
      dv = M.device; molla(pj, {''}, dv.k1, dv.c);
      if dv.k3 > 0 || dv.s0 > 0, warning('dispositivo: in Simscape solo la parte lineare k1 e lo smorzatore (k3 e corsa libera non inclusi)'); end
    end
  end
  np = 0;
  for i = 1:numel(M.supports)
    s = getb(M.supports, i);
    switch s.type
      case 'perno'   % giunto rotoidale nel nodo, asse = tangente (z del telaio)
        ta = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Pa%d', i)); setT(ta, s.R, s.p(:));
        if strcmp(s.to, 'ground'), conn(W, WF, pc(ta, 'L', 1)); else, conn(W, bulkF, pc(ta, 'L', 1)); end
        tb2 = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Pb%d', i)); setT(tb2, s.R, s.p(:));
        conn(W, BF(s.body), pc(tb2, 'L', 1));
        rj = addb(W, 'sm_lib/Joints/Revolute Joint', sprintf('Perno%d', i));
        conn(W, pc(ta, 'R', 1), pc(rj, 'L', 1)); conn(W, pc(tb2, 'R', 1), pc(rj, 'R', 1)); np = np + 1;
      case 'piano'   % vincolo a penalita: molla lungo la normale n (come nel tool), il resto libero
        Rn = assi(s.n(:));
        ta = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Va%d', i)); setT(ta, Rn, s.p(:)); conn(W, WF, pc(ta, 'L', 1));
        tb2 = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Vb%d', i)); setT(tb2, Rn, s.p(:)); conn(W, BF(s.body), pc(tb2, 'L', 1));
        bj = addb(W, 'sm_lib/Joints/Bushing Joint', sprintf('Vincolo%d', i));
        molla(bj, {'Pz'}, s.k, M.damping * s.k);
        conn(W, pc(ta, 'R', 1), pc(bj, 'L', 1)); conn(W, pc(tb2, 'R', 1), pc(bj, 'R', 1)); np = np + 1;
    end
  end
  % spinta sui fondi (estremita chiuse): forza assiale p*A
  for i = 1:numel(M.endThrust)
    e = getb(M.endThrust, i);
    if isfield(e, 'to') && strcmp(e.to, 'bulkhead'), fr = bulkF; pos = [0; 0; M.bulkhead.z];
    else, fr = BF(e.body); pos = e.p(:); end
    t = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', sprintf('Ft%d', i)); setT(t, eye(3), pos); conn(W, fr, pc(t, 'L', 1));
    ef = addb(W, 'sm_lib/Forces and Torques/External Force and Torque', sprintf('Spinta%d', i));
    setq(ef, {'EnableForce', 'ForceFlag'}, 'on'); trysetp(ef, 'ForceResolutionFrame', 'WorldFrame'); trysetp(ef, 'ForceResolutionFrame', 'World');
    [pF, ~, pE] = portForza(ef); conn(W, pc(t, 'R', 1), pE);
    g = addb(W, 'simulink/Math Operations/Gain', sprintf('gS%d', i)); setp(g, 'Gain', mat2str(e.area * e.dir(:), 12), 'Multiplication', 'Element-wise(K.*u)');
    cv = addb(W, 'nesl_utility/Simulink-PS Converter', sprintf('cS%d', i)); setp(cv, 'Unit', 'N');
    wire(W, ps, 1, g, 1); wire(W, g, 1, cv, 1); conn(W, pc(cv, 'R', 1), pF);
  end
  % uscite: raggio medio dei nodi a meta altezza, altezza (nodo in alto)
  mids = M.outputs.midNodes; rr = {};
  for i = 1:numel(mids)
    b = getb(M.bodies, mids(i)); [rs, ~] = sensore(W, WF, BF(mids(i)), b.node(:), sprintf('Sm%d', i)); rr{end+1} = rs; %#ok<AGROW>
  end
  if ~isempty(rr)
    mu = addb(W, 'simulink/Math Operations/Sum', 'Rsum'); setp(mu, 'Inputs', repmat('+', 1, numel(rr)));
    for i = 1:numel(rr), wire(W, rr{i}, 1, mu, i); end
    gm = addb(W, 'simulink/Math Operations/Gain', 'Rmedio'); setp(gm, 'Gain', num2str(1/numel(rr)));
    wire(W, mu, 1, gm, 1); tw = addb(W, 'simulink/Sinks/To Workspace', 'tw_R'); setp(tw, 'VariableName', 'Rm', 'SaveFormat', 'Timeseries'); wire(W, gm, 1, tw, 1);
  end
  if ~isempty(M.outputs.topNode)
    b = getb(M.bodies, M.outputs.topNode); [~, zs] = sensore(W, WF, BF(M.outputs.topNode), b.node(:), 'Stop');
    tw = addb(W, 'simulink/Sinks/To Workspace', 'tw_H'); setp(tw, 'VariableName', 'Hz', 'SaveFormat', 'Timeseries'); wire(W, zs, 1, tw, 1);
  end
  tw = addb(W, 'simulink/Sinks/To Workspace', 'tw_P'); setp(tw, 'VariableName', 'Pt', 'SaveFormat', 'Timeseries'); wire(W, ps, 1, tw, 1);
  set_param(W.mdl, 'StopTime', num2str(T), 'Solver', 'ode15s', 'MaxStep', num2str(T/400), 'RelTol', '1e-4', 'ReturnWorkspaceOutputs', 'on');
  save_system(W.mdl, fullfile(o.Cartella, [W.mdl '.slx']));
  out = struct('modello', W.mdl, 'vincoli', np);
  if o.Apri, open_system(W.mdl); end
  if ~o.Simula, return; end
  fprintf('simulazione %s (%g s)...\n', W.mdl, T);
  so = sim(W.mdl);
  t = so.Pt.Time; out.t = t; out.p = so.Pt.Data(:);
  if isfield(so, 'Rm') || isprop(so, 'Rm'), out.Rmedio = interp1(so.Rm.Time, so.Rm.Data(:), t); end
  if isfield(so, 'Hz') || isprop(so, 'Hz'), out.altezza = interp1(so.Hz.Time, so.Hz.Data(:), t); end
  save(fullfile(o.Cartella, ['risultati_' W.mdl '.mat']), '-struct', 'out');
  fg = figure('Visible', 'off', 'Position', [100 100 1100 420]);
  subplot(1, 2, 1); plot(t, out.p / 101325, 'LineWidth', 1.8); grid on; xlabel('t [s]'); ylabel('p [atm]'); title('Pressione');
  if isfield(out, 'Rmedio'), subplot(1, 2, 2); plot(out.p / 101325, out.Rmedio / M.R, 'LineWidth', 1.8); grid on; xlabel('p [atm]'); ylabel('r / R a meta altezza'); title('Apertura'); end
  exportgraphics(fg, fullfile(o.Cartella, ['grafico_' W.mdl '.png']), 'Resolution', 150); close(fg);
end

% =====================================================================================================
% utilita
function b = getb(S, i)
  if iscell(S), b = S{i}; else, b = S(i); end
end
function h = addb(W, lib, name)
  h = add_block(lib, [W.mdl '/' name], 'MakeNameUnique', 'on');
end
function setp(h, varargin)
  try
    set_param(h, varargin{:});
  catch err
    dp = fieldnames(get_param(h, 'DialogParameters'));
    error('tubo_simscape:param', '%s\nblocco %s, parametri disponibili: %s', err.message, getfullname(h), strjoin(dp.', ', '));
  end
end
function trysetp(h, varargin)
  try, set_param(h, varargin{:}); catch, end
end
function setv(h, nome, valori)
  % primo valore accettato fra valori (le stringhe delle opzioni cambiano fra le versioni)
  for i = 1:numel(valori), try, set_param(h, nome, valori{i}); return; catch, end, end
  setp(h, nome, valori{1});   % ripete il primo per avere il messaggio d'errore
end
function setq(h, nomi, val)
  % imposta il primo parametro esistente fra nomi (i nomi cambiano fra le versioni di Simscape Multibody);
  % val e un valore unico oppure una cella con un valore per ogni nome
  dp = fieldnames(get_param(h, 'DialogParameters'));
  for i = 1:numel(nomi)
    if any(strcmp(dp, nomi{i}))
      if iscell(val), v = val{i}; else, v = val; end
      setp(h, nomi{i}, v); return;
    end
  end
  error('tubo_simscape:param', 'blocco %s: nessuno dei parametri %s', getfullname(h), strjoin(nomi, ', '));
end
function p = pc(h, side, k)
  % porta fisica k sul lato indicato; i blocchi con una sola porta (solidi, inerzie, configurazioni) la hanno a
  % sinistra o a destra secondo la versione, quindi si usa quella che c'e
  ph = get_param(h, 'PortHandles');
  if side == 'L', p = ph.LConn; q = ph.RConn; else, p = ph.RConn; q = ph.LConn; end
  if numel(p) >= k, p = p(k);
  elseif k == 1 && isempty(p) && numel(q) == 1, p = q(1);
  else, error('tubo_simscape:porta', 'blocco %s: porta %s%d assente', getfullname(h), side, k); end
end
function conn(W, a, b)
  add_line(W.mdl, a, b, 'autorouting', 'off');
end
function wire(W, a, ka, b, kb)
  pa = get_param(a, 'PortHandles'); pb = get_param(b, 'PortHandles');
  add_line(W.mdl, pa.Outport(ka), pb.Inport(kb), 'autorouting', 'off');
end
function setT(h, R, p)
  R = reshape(R, 3, 3); if isvector(p), p = p(:); end
  setp(h, 'RotationMethod', 'RotationMatrix', 'RotationMatrix', mat2str(R, 12), ...
          'TranslationMethod', 'Cartesian', 'TranslationCartesianOffset', mat2str(p.', 12));
end
function molla(j, prims, k, c)
  % rigidezza e smorzamento di una primitiva (Px, Py, Pz, Rx, Ry, Rz; '' = giunto con una sola primitiva)
  for i = 1:numel(prims)
    pfx = prims{i};
    % unita esplicite: di default le primitive rotazionali sono in N*m/deg (57,3 volte piu rigide di N*m/rad)
    if ~isempty(pfx) && pfx(1) == 'R', uk = 'N*m/rad'; uc = 'N*m/(rad/s)'; else, uk = 'N/m'; uc = 'N/(m/s)'; end
    if isempty(pfx), trysetp(j, [pfx 'SpringStiffnessUnits'], uk, [pfx 'DampingCoefficientUnits'], uc);   % giunto prismatico del dispositivo
    else, setp(j, [pfx 'SpringStiffnessUnits'], uk, [pfx 'DampingCoefficientUnits'], uc); end
    setp(j, [pfx 'SpringStiffness'], num2str(k, 12), [pfx 'DampingCoefficient'], num2str(c, 12));
  end
end
function [Rp, c, XY] = pianoPezzo(V)
  % piano medio di un pezzo (Newell), origine nel baricentro dei vertici, x lungo il primo lato
  n = [0 0 0];
  for i = 1:size(V, 1), a = V(i, :); b = V(mod(i, size(V, 1)) + 1, :); n = n + [(a(2)-b(2))*(a(3)+b(3)), (a(3)-b(3))*(a(1)+b(1)), (a(1)-b(1))*(a(2)+b(2))]; end
  n = n / norm(n); c = mean(V, 1).';
  x = V(2, :) - V(1, :); x = x - dot(x, n) * n; x = x / norm(x); y = cross(n, x);
  Rp = [x(:) y(:) n(:)];
  XY = (V - c.') * Rp(:, 1:2);
  x2 = XY(:, 1); y2 = XY(:, 2); if sum(x2 .* y2([2:end 1]) - x2([2:end 1]) .* y2) < 0, XY = flipud(XY); end   % senso antiorario
end
function R = assi(z)
  z = z / norm(z); t = [1; 0; 0]; if abs(dot(t, z)) > 0.9, t = [0; 1; 0]; end
  x = t - dot(t, z) * z; x = x / norm(x); R = [x cross(z, x) z];
end
function [pf, pv] = portSensori(pj)
  % porte del giunto prismatico con moto in ingresso e sensori: ingresso q a sinistra, uscite a destra
  ph = get_param(pj, 'PortHandles'); r = ph.RConn;
  % ordine delle uscite: v (velocita) prima della forza dell'attuatore
  pv = r(2); pf = r(end);
end
function [pF, pT, pE] = portForza(ef)
  % ingressi F e T (segnali fisici) e telaio della External Force and Torque: nelle versioni recenti il telaio
  % e a destra e a sinistra ci sono solo gli ingressi; in quelle precedenti il telaio era la prima porta a sinistra
  ph = get_param(ef, 'PortHandles'); l = ph.LConn; r = ph.RConn;
  if ~isempty(r), pE = r(1); in = l; else, pE = l(1); in = l(2:end); end
  pF = in(1); if numel(in) >= 2, pT = in(2); else, pT = []; end
end
function [rs, zs] = sensore(W, WF, BFi, X, name)
  % posizione del nodo X del corpo (telaio O_ del corpo = mondo a t=0) misurata nel mondo
  t = addb(W, 'sm_lib/Frames and Transforms/Rigid Transform', [name '_t']); setT(t, eye(3), X); conn(W, BFi, pc(t, 'L', 1));
  s = addb(W, 'sm_lib/Frames and Transforms/Transform Sensor', name);
  setp(s, 'SenseX', 'on', 'SenseY', 'on', 'SenseZ', 'on');
  conn(W, WF, pc(s, 'L', 1)); conn(W, pc(t, 'R', 1), pc(s, 'R', 1));
  ph = get_param(s, 'PortHandles'); r = ph.RConn;
  cx = addb(W, 'nesl_utility/PS-Simulink Converter', [name '_x']); cy = addb(W, 'nesl_utility/PS-Simulink Converter', [name '_y']); cz = addb(W, 'nesl_utility/PS-Simulink Converter', [name '_z']);
  conn(W, r(2), pc(cx, 'L', 1)); conn(W, r(3), pc(cy, 'L', 1)); conn(W, r(4), pc(cz, 'L', 1));
  f = addb(W, 'simulink/User-Defined Functions/Fcn', [name '_r']); setp(f, 'Expression', 'sqrt(u(1)^2+u(2)^2)');
  mx = addb(W, 'simulink/Signal Routing/Mux', [name '_m']); setp(mx, 'Inputs', '2');
  wire(W, cx, 1, mx, 1); wire(W, cy, 1, mx, 2); wire(W, mx, 1, f, 1);
  rs = f; zs = cz;
end
`;
