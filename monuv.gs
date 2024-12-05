function processarCamerasMONUV() {
  try {
    const token = obterToken();
    const cameras = buscarCameras(token);
    const camerasComSerial = filtrarCamerasComSerial(cameras);
    salvarNaPlanilha(camerasComSerial);
    return { success: true, message: 'Dados processados com sucesso!' };
  } catch (error) {
    Logger.log('Erro no processamento: ' + error);
    return { success: false, error: error.toString() };
  }
}

function obterToken() {
  const EMAIL = 'auth@whitebr.com';
  const SENHA = '1@23Mudar';
  
  const opcoes = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify({
      'email': EMAIL,
      'password': SENHA
    })
  };
  
  try {
    const resposta = UrlFetchApp.fetch('https://app.monuv.com.br/api/authenticate', opcoes);
    const token = JSON.parse(resposta.getContentText()).token;
    return token;
  } catch (error) {
    Logger.log('Erro na autenticação: ' + error);
    throw new Error('Falha na autenticação: ' + error);
  }
}

function buscarCameras(token) {
  const url = `https://app.monuv.com.br/api/cameras?token=${token}`;
  try {
    const resposta = UrlFetchApp.fetch(url);
    const dadosResposta = JSON.parse(resposta.getContentText());
    
    // Log para debug
    Logger.log('Estrutura da resposta:');
    Logger.log(JSON.stringify(dadosResposta, null, 2));
    
    let cameras = [];
    if (Array.isArray(dadosResposta)) {
      cameras = dadosResposta;
    } else if (dadosResposta.cameras) {
      cameras = dadosResposta.cameras;
    } else if (dadosResposta.data) {
      cameras = dadosResposta.data;
    } else {
      throw new Error('Formato de resposta não reconhecido');
    }
    
    // Log da primeira câmera para verificar estrutura
    if (cameras.length > 0) {
      Logger.log('Exemplo de câmera:');
      Logger.log(JSON.stringify(cameras[0], null, 2));
    }
    
    return cameras;
  } catch (error) {
    Logger.log('Erro ao buscar câmeras: ' + error);
    throw new Error('Falha ao buscar câmeras: ' + error);
  }
}

function filtrarCamerasComSerial(cameras) {
  const serialPattern = /(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{13}/;
  
  return cameras.filter(camera => {
    const description = camera.description || '';
    return serialPattern.test(description);
  }).map(camera => {
    const description = camera.description || '';
    let serial = '';
    
    const matches = description.match(/(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{13}/g) || [];
    
    for (const match of matches) {
      const numCount = (match.match(/[0-9]/g) || []).length;
      const letterCount = (match.match(/[A-Z]/g) || []).length;
      
      if (numCount >= 3 && letterCount >= 3) {
        serial = match;
        break;
      }
    }
    
    const address = camera.camera_location ? camera.camera_location.complete_address : '';
    const connection_type = camera.is_rtmp ? 1 : null;
    
    // Processa o plano para extrair resolution_id e history_days
    let resolution_id = null;
    let history_days = null;
    
    if (camera.plan) {
      // Extrai resolution_id
      if (camera.plan.toLowerCase().includes('hd')) {
        resolution_id = camera.plan.toLowerCase().includes('full') ? 5 : 2;
      }
      
      // Extrai history_days
      const daysMatch = camera.plan.match(/\((\d+)\s*dias?\)/i);
      if (daysMatch) {
        history_days = parseInt(daysMatch[1]);
      }
    }
    
    return {
      camera_id: camera.id,
      client_id: camera.client_id,
      description: camera.description,
      address: address,
      serial: serial,
      demo: camera.demo,
      camera_address: camera.camera_address,
      latitude: camera.latitude || (camera.camera_location ? camera.camera_location.latitude : ''),
      longitude: camera.longitude || (camera.camera_location ? camera.camera_location.longitude : ''),
      connection_type: connection_type,
      resolution_id: resolution_id,
      history_days: history_days
    };
  }).filter(item => {
    if (!item.serial) return false;
    const numCount = (item.serial.match(/[0-9]/g) || []).length;
    const letterCount = (item.serial.match(/[A-Z]/g) || []).length;
    return numCount >= 3 && letterCount >= 3;
  });
}

function salvarNaPlanilha(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Cameras Monuv');
  
  // Cria a aba se não existir
  if (!sheet) {
    sheet = ss.insertSheet('Cameras Monuv');
    
    // Define os cabeçalhos em uma única linha
    const headers = [
      'ID Camera',
      'ID Cliente',
      'Nome Camera',
      'Endereço',
      'Serial',
      'Demo',
      'Latitude',
      'Longitude',
      'Connection Type',
      'Resolution ID',
      'History Days'
    ];
    
    // Adiciona cabeçalhos
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    
    // Formata cabeçalhos
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#f3f3f3');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
  }
  
  // Limpa dados existentes (mantém cabeçalho)
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 11).clear();
  }
  
  // Prepara os dados para inserção
  const dadosParaInserir = dados.map(item => [
    item.camera_id,
    item.client_id,
    item.description,
    item.address,
    item.serial,
    item.demo,
    item.latitude,
    item.longitude,
    item.connection_type,
    item.resolution_id,
    item.history_days
  ]);
  
  // Insere os novos dados
  if (dadosParaInserir.length > 0) {
    sheet.getRange(2, 1, dadosParaInserir.length, 11).setValues(dadosParaInserir);
    
    // Formata os dados
    const dataRange = sheet.getRange(2, 1, dadosParaInserir.length, 11);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true);
  }
  
  // Ajusta as colunas
  sheet.autoResizeColumns(1, 11);
  
  // Sincroniza automaticamente com a aba Cadastros
  sincronizarComCadastros();
  Logger.log('Dados salvos e sincronizados com sucesso!');
}

function sincronizarComCadastros() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monuvSheet = ss.getSheetByName('Cameras Monuv');
  let cadastrosSheet = ss.getSheetByName('Cadastros');
  
  // Se a aba Cadastros não existir, cria com os mesmos cabeçalhos
  if (!cadastrosSheet) {
    cadastrosSheet = ss.insertSheet('Cadastros');
    const headers = [
      'ID Camera',
      'ID Cliente',
      'Nome Camera',
      'Endereço',
      'Serial',
      'Demo',
      'Latitude',
      'Longitude',
      'Connection Type',
      'Resolution ID',
      'History Days'
    ];
    
    cadastrosSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    cadastrosSheet.setFrozenRows(1);
    
    // Formata cabeçalhos
    const headerRange = cadastrosSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#f3f3f3');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
  }
  
  // Limpa todos os dados existentes em Cadastros (mantém cabeçalho)
  const lastRowCadastros = Math.max(cadastrosSheet.getLastRow(), 1);
  if (lastRowCadastros > 1) {
    cadastrosSheet.getRange(2, 1, lastRowCadastros - 1, 11).clear();
  }
  
  // Pega todos os dados de Cameras Monuv
  const lastRowMonuv = monuvSheet.getLastRow();
  if (lastRowMonuv > 1) {
    const dados = monuvSheet.getRange(2, 1, lastRowMonuv - 1, 11).getValues();
    
    // Copia para Cadastros
    cadastrosSheet.getRange(2, 1, dados.length, 11).setValues(dados);
    
    // Formata os dados
    const dataRange = cadastrosSheet.getRange(2, 1, dados.length, 11);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true);
  }
  
  // Ajusta as colunas
  cadastrosSheet.autoResizeColumns(1, 11);
}

// Modifica a função atualizarDadosMonuv para incluir a sincronização
function atualizarDadosMonuv() {
  const resultado = processarCamerasMONUV();
  if (resultado.success) {
    // Após salvar os dados da Monuv, sincroniza com Cadastros
    sincronizarComCadastros();
    Logger.log('Atualização e sincronização concluídas com sucesso!');
  } else {
    Logger.log('Erro na atualização: ' + resultado.error);
  }
}

// Função para testar a criação da aba Cadastros
function testarCriacaoCadastros() {
  try {
    sincronizarComCadastros();
    Logger.log('Aba Cadastros criada/atualizada com sucesso!');
  } catch (error) {
    Logger.log('Erro ao criar aba Cadastros: ' + error);
  }
}

function criarAbaCadastros() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let cadastrosSheet = ss.getSheetByName('Cadastros');
  
  if (!cadastrosSheet) {
    cadastrosSheet = ss.insertSheet('Cadastros');
    const headers = [
      'ID Camera',
      'ID Cliente',
      'Nome Camera',
      'Endereço',
      'Serial',
      'Demo',
      'Latitude',
      'Longitude',
      'Connection Type',
      'Resolution ID',
      'History Days'
    ];
    
    cadastrosSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    cadastrosSheet.setFrozenRows(1);
    
    const headerRange = cadastrosSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#f3f3f3');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    Logger.log('Aba Cadastros criada com sucesso!');
  } else {
    Logger.log('Aba Cadastros já existe!');
  }
} 